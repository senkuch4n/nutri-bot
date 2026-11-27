import { prisma, type Prisma } from "../index";
import { PROFESSIONAL_SELECT } from "./professionalSelect";

// HU-025 (4.3 de la SDD): la agenda principal de un consultorio y su profesional.
// Generaliza resolveOriginalAgenda de legacySchedulingScope.ts a cualquier tenant. El tenant llega
// siempre de quien llama (contexto de la sesión en web, conversación en el bot), nunca del cliente.

/** Lo que reciben las funciones de dominio como primer parámetro. TenantContext (web) lo cumple. */
export type TenantRef = { tenantId: string };
/** Misma forma que ORIGINAL_SCOPE de HU-024. */
export type TenantScope = { tenantId: string; agendaId: string };

export type ScopeClient = Pick<Prisma.TransactionClient, "agenda">;

const CONTACT_SELECT = { timezone: true, phoneJid: true } as const satisfies Prisma.ProfessionalSelect;
const DIGEST_SELECT = {
  ...CONTACT_SELECT,
  afterHoursEnabled: true,
  afterHoursStart: true,
  afterHoursEnd: true,
} as const satisfies Prisma.ProfessionalSelect;
/** HU-028b: la conexión de Google vive en GoogleCalendarAccount; de la profesional solo hace falta la zona. */
const CALENDAR_SELECT = { timezone: true } as const satisfies Prisma.ProfessionalSelect;

export type SchedulingContext = { scope: TenantScope; professional: { timezone: string; phoneJid: string | null } };
export type DigestContext = {
  scope: TenantScope;
  professional: Prisma.ProfessionalGetPayload<{ select: typeof DIGEST_SELECT }>;
};
export type CalendarContext = {
  scope: TenantScope;
  professional: { timezone: string };
  agendaOwner: { isPrimary: true; professionalId: number };
};

export type TenantProfessional = Prisma.ProfessionalGetPayload<{ select: typeof PROFESSIONAL_SELECT }>;

export type TenantScopeErrorCode = "tenant_scope_missing";

/** El consultorio no tiene agenda principal: no se puede operar (sin datos del tenant en el mensaje). */
export class TenantScopeError extends Error {
  readonly code: TenantScopeErrorCode;
  constructor(code: TenantScopeErrorCode = "tenant_scope_missing") {
    super(`tenant_scope:${code}`);
    this.name = "TenantScopeError";
    this.code = code;
  }
}

/** Resultado interno: incluye el id de la profesional para la fachada legacy y el calendario. */
export type ResolvedPrimaryAgenda<S extends Prisma.ProfessionalSelect> = {
  scope: TenantScope;
  professionalId: number;
  professional: Prisma.ProfessionalGetPayload<{ select: S }>;
};

/** Agenda principal (índice parcial único `Agenda_primary_per_tenant_key`) + su profesional del mismo
 *  tenant (la FK compuesta Agenda(professionalId, tenantId) → Professional(id, tenantId) lo garantiza).
 *  Tira TenantScopeError("tenant_scope_missing") si no hay agenda principal. */
export async function resolvePrimaryAgenda<S extends Prisma.ProfessionalSelect>(
  db: ScopeClient,
  tenantId: string,
  select: S,
): Promise<ResolvedPrimaryAgenda<S>> {
  if (!tenantId) throw new TenantScopeError();
  const agenda = await db.agenda.findFirst({
    where: { tenantId, isPrimary: true },
    select: { id: true, tenantId: true, professionalId: true, professional: { select } },
  });
  if (!agenda || agenda.tenantId !== tenantId) throw new TenantScopeError();
  return {
    scope: { tenantId: agenda.tenantId, agendaId: agenda.id },
    professionalId: agenda.professionalId,
    professional: agenda.professional as Prisma.ProfessionalGetPayload<{ select: S }>,
  };
}

export async function resolveTenantSchedulingContext(db: ScopeClient, tenantId: string): Promise<SchedulingContext> {
  const { scope, professional } = await resolvePrimaryAgenda(db, tenantId, CONTACT_SELECT);
  return { scope, professional };
}

export async function resolveTenantDigestContext(db: ScopeClient, tenantId: string): Promise<DigestContext> {
  const { scope, professional } = await resolvePrimaryAgenda(db, tenantId, DIGEST_SELECT);
  return { scope, professional };
}

export async function resolveTenantCalendarContext(db: ScopeClient, tenantId: string): Promise<CalendarContext> {
  const { scope, professionalId, professional } = await resolvePrimaryAgenda(db, tenantId, CALENDAR_SELECT);
  return { scope, professional, agendaOwner: { isPrimary: true, professionalId } };
}

/** PROFESSIONAL_SELECT de la profesional de la agenda principal del tenant.
 *  Consume: web y bot. */
export async function getTenantProfessional(tenantId: string, db: ScopeClient = prisma): Promise<TenantProfessional> {
  return (await resolvePrimaryAgenda(db, tenantId, PROFESSIONAL_SELECT)).professional;
}

/** Para el shell: nunca tira (null ante error o consultorio sin agenda principal). */
export async function findTenantProfessionalSummary(
  tenantId: string,
): Promise<{ name: string; title: string | null; phoneJid: string | null; botPaused: boolean } | null> {
  try {
    const { professional } = await resolvePrimaryAgenda(prisma, tenantId, {
      name: true, title: true, phoneJid: true, botPaused: true,
    } as const);
    return professional;
  } catch {
    return null;
  }
}

/** Lock de escritura de agenda del tenant (antes: `SELECT id FROM "Professional" WHERE id = 1 FOR UPDATE`).
 *  Bloquea la fila de la profesional de la agenda principal: reservar, reprogramar, archivar y pedir
 *  confirmación quedan serializados por consultorio. Devuelve false si el tenant no tiene agenda principal. */
export async function lockTenantScheduling(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  tenantId: string,
): Promise<boolean> {
  const locked = await tx.$queryRaw<{ id: number }[]>`SELECT p.id FROM "Professional" p
    JOIN "Agenda" a ON a."professionalId" = p.id AND a."tenantId" = p."tenantId"
    WHERE a."tenantId" = ${tenantId} AND a."isPrimary" = true
    FOR UPDATE OF p`;
  return Array.isArray(locked) && locked.length === 1;
}
