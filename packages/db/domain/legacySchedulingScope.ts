import { prisma, type Prisma } from "../index";

// Fixed IDs established by the tenant foundation migration, not a tenant selector.
const ORIGINAL_SCOPE = { tenantId: "legacy-tenant", agendaId: "legacy-agenda" } as const;

type ScopeClient = Pick<Prisma.TransactionClient, "agenda">;
const ORIGINAL_AGENDA_OWNER = { isPrimary: true, professionalId: 1 } as const;
const CONTACT_SELECT = { timezone: true, phoneJid: true } as const;

export function resolveLegacySchedulingScope(db: ScopeClient = prisma) {
  return resolveOriginalAgenda(db, CONTACT_SELECT);
}

export function resolveLegacyDigestScope(db: ScopeClient = prisma) {
  return resolveOriginalAgenda(db, {
    ...CONTACT_SELECT,
    afterHoursEnabled: true,
    afterHoursStart: true,
    afterHoursEnd: true,
  } as const);
}

export async function resolveLegacyCalendarScope(db: ScopeClient = prisma) {
  const resolved = await resolveOriginalAgenda(db, {
    timezone: true,
    googleRefreshToken: true,
    googleCalendarId: true,
    googleSyncError: true,
  } as const);
  return { ...resolved, agendaOwner: ORIGINAL_AGENDA_OWNER };
}

async function resolveOriginalAgenda<S extends Prisma.ProfessionalSelect>(db: ScopeClient, select: S) {
  const { tenantId, agendaId } = ORIGINAL_SCOPE;
  // The composite agenda key is backed by FKs to Tenant and to Professional in the same tenant.
  const agenda = await db.agenda.findUnique({
    where: { id_tenantId: { id: agendaId, tenantId }, ...ORIGINAL_AGENDA_OWNER },
    select: { professional: { select } },
  });
  if (!agenda) throw new Error("No se pudo verificar la agenda de la instalación original.");
  return { scope: ORIGINAL_SCOPE, professional: agenda.professional };
}
