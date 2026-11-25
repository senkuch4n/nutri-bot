import { canRemoveMember, canonicalEmail, type AccessFacts, type MembershipRole, type RemoveMemberCheck } from "@nutri-bot/core";
import { prisma, type Prisma, type PrismaClient } from "../index";

// HU-025: identidad de Google verificada y hechos de acceso a un consultorio.
// La decisión (pura) vive en @nutri-bot/core (decideTenantAccess); acá solo se lee y se escribe.

/** Consultorio original creado por la migración tenant_foundation de HU-024. */
export const LEGACY_TENANT_ID = "legacy-tenant";

export type GoogleIdentity = { subject: string; email: string }; // email ya verificado por Google
export type IdentityRegistration = { status: "linked"; userId: string } | { status: "conflict" };

/** Lo que usa registerGoogleIdentity: abre su propia transacción. */
export type RegisterIdentityClient = Pick<PrismaClient, "$transaction">;
/** Lo que usa loadAccessFacts (sirve un PrismaClient o un TransactionClient). */
export type AccessFactsClient = Pick<Prisma.TransactionClient, "user">;

const IDENTITY_LOCK = "user-identity";

/** Login con Google verificado (tabla 6.2 de la SDD). Actualiza lastSignInAt. Nunca reasigna sub ni email.
 *
 *  - Existe un User con ese `sub` → linked (ese User), solo actualiza `lastSignInAt`.
 *  - No existe el `sub` ni ningún User con ese email canónico → crea el User pendiente.
 *  - No existe el `sub` y hay un User con ese email (con otro `sub` o sin `sub`) → conflict, sin escrituras.
 *
 *  Serializado con un advisory lock de transacción; una violación de unicidad concurrente es conflict.
 *  Consume: web (auth.ts, callback jwt). */
export async function registerGoogleIdentity(
  identity: GoogleIdentity,
  now: Date = new Date(),
  db: RegisterIdentityClient = prisma,
): Promise<IdentityRegistration> {
  const subject = identity.subject;
  const email = canonicalEmail(identity.email);
  if (!subject || !email) return { status: "conflict" };

  try {
    return await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${IDENTITY_LOCK}))`;

        const bySubject = await tx.user.findUnique({ where: { googleSubject: subject }, select: { id: true } });
        if (bySubject) {
          await tx.user.update({ where: { id: bySubject.id }, data: { lastSignInAt: now }, select: { id: true } });
          return { status: "linked", userId: bySubject.id } as const;
        }

        // Emails históricos pueden tener mayúsculas o espacios (ver legacy-memberships.ts).
        const byEmail = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "User" WHERE lower(btrim(email)) = ${email} LIMIT 1`;
        // No se vincula por email (S24 de HU-024): el operador lo resuelve por script.
        if (byEmail.length > 0) return { status: "conflict" } as const;

        const created = await tx.user.create({
          data: { email, googleSubject: subject, lastSignInAt: now },
          select: { id: true },
        });
        return { status: "linked", userId: created.id } as const;
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "conflict" };
    throw error;
  }
}

/** Lee los hechos para decideTenantAccess. memberships take 2 (alcanza para detectar ambigüedad).
 *  025a: sin acceso de plataforma todavía (platformOperator false, activeSupportGrants []); `now` lo usa 025d
 *  para los permisos vigentes. Consume: web (middleware, tenant-context, auth.ts). */
export async function loadAccessFacts(
  userId: string,
  now: Date,
  db: AccessFactsClient = prisma,
): Promise<AccessFacts | null> {
  void now;
  if (!userId) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      googleSubject: true,
      memberships: { take: 2, orderBy: { tenantId: "asc" }, select: { tenantId: true, role: true } },
    },
  });
  if (!user) return null;
  return {
    linked: user.googleSubject !== null,
    memberships: user.memberships.map(({ tenantId, role }) => ({ tenantId, role: role as MembershipRole })),
    platformOperator: false,
    activeSupportGrants: [],
  };
}

// ---------------------------------------------------------------------------------------------
// Equipo (025b-2, 7.2.1 de la SDD). Consume: web (Ajustes → Equipo). Solo lee y borra membresías del
// tenant recibido; el tenant sale siempre del contexto de la sesión de quien llama.
// ---------------------------------------------------------------------------------------------

export type TenantMember = { userId: string; email: string; role: MembershipRole; createdAt: Date };

/** Miembros del consultorio, responsables primero y después por fecha de alta. */
export async function listTenantMembers(tenantId: string, db: Pick<Prisma.TransactionClient, "tenantMembership"> = prisma): Promise<TenantMember[]> {
  const rows = await db.tenantMembership.findMany({
    where: { tenantId },
    select: { userId: true, role: true, createdAt: true, user: { select: { email: true } } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }, { userId: "asc" }],
  });
  return rows.map((r) => ({ userId: r.userId, email: r.user.email, role: r.role as MembershipRole, createdAt: r.createdAt }));
}

export type RemoveTenantMemberClient = Pick<PrismaClient, "$transaction">;

/** "Quitar acceso" (7.2.1). En una transacción ReadCommitted bloquea con FOR UPDATE TODAS las membresías del
 *  tenant (R12: dos OWNER quitándose a la vez quedan serializadas y la segunda ve ownerCount = 1), decide con
 *  canRemoveMember y, si corresponde, borra solo esa membresía (el User queda como identidad pendiente).
 *  Un objetivo de otro consultorio o inventado → not_member, sin distinguirlo. La persona quitada pierde el
 *  acceso en su siguiente request (la membresía se lee por request). */
export async function removeTenantMember(
  p: { tenantId: string; actorUserId: string; targetUserId: string },
  db: RemoveTenantMemberClient = prisma,
): Promise<RemoveMemberCheck> {
  const { tenantId, actorUserId, targetUserId } = p;
  if (!tenantId || !actorUserId || !targetUserId) return { ok: false, reason: "not_member" };
  return db.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ userId: string; role: string }[]>`
        SELECT "userId", role::text AS role FROM "TenantMembership" WHERE "tenantId" = ${tenantId} FOR UPDATE`;
      const roleOf = (userId: string): MembershipRole | null => {
        const role = rows.find((r) => r.userId === userId)?.role;
        return role === "OWNER" || role === "STAFF" ? role : null;
      };
      const targetRole = roleOf(targetUserId);
      const check = canRemoveMember({
        actor: { userId: actorUserId, role: roleOf(actorUserId) },
        target: targetRole ? { userId: targetUserId, role: targetRole } : null,
        ownerCount: rows.filter((r) => r.role === "OWNER").length,
      });
      if (!check.ok) return check;
      const { count } = await tx.tenantMembership.deleteMany({ where: { tenantId, userId: targetUserId } });
      return count === 1 ? check : ({ ok: false, reason: "not_member" } as const);
    },
    { isolationLevel: "ReadCommitted" },
  );
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}
