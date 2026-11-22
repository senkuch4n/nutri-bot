import { canonicalEmail, type AccessFacts, type MembershipRole } from "@nutri-bot/core";
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

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}
