import { prisma, type Prisma } from "../index";
import { LEGACY_TENANT_ID } from "./tenantAccess";
import type { DigestContext, SchedulingContext, ScopeClient, TenantScope } from "./tenantScope";

// HU-025 (4.3): fachada fina para el bot y los crons de la instalación original hasta HU-027.
// Equivale a resolveTenant*Context(db, LEGACY_TENANT_ID) y conserva la verificación extra de HU-024:
// la agenda principal del tenant legacy tiene que ser `legacy-agenda` y su profesional, Professional(1).
// Ningún archivo de apps/web puede importarla después de 025b (test de guarda).

// Fixed IDs established by the tenant foundation migration, not a tenant selector.
const ORIGINAL_SCOPE: TenantScope = { tenantId: LEGACY_TENANT_ID, agendaId: "legacy-agenda" };

const ORIGINAL_AGENDA_OWNER = { isPrimary: true, professionalId: 1 } as const;
const CONTACT_SELECT = { timezone: true, phoneJid: true } as const;

export function resolveLegacySchedulingScope(db: ScopeClient = prisma): Promise<SchedulingContext> {
  return resolveOriginalAgenda(db, CONTACT_SELECT);
}

export function resolveLegacyDigestScope(db: ScopeClient = prisma): Promise<DigestContext> {
  return resolveOriginalAgenda(db, {
    ...CONTACT_SELECT,
    afterHoursEnabled: true,
    afterHoursStart: true,
    afterHoursEnd: true,
  } as const);
}

async function resolveOriginalAgenda<S extends Prisma.ProfessionalSelect>(db: ScopeClient, select: S) {
  const { tenantId, agendaId } = ORIGINAL_SCOPE;
  // The composite agenda key is backed by FKs to Tenant and to Professional in the same tenant.
  // Stricter than resolveTenantSchedulingContext: the primary agenda must also be the fixed legacy one.
  const agenda = await db.agenda.findUnique({
    where: { id_tenantId: { id: agendaId, tenantId }, ...ORIGINAL_AGENDA_OWNER },
    select: { professional: { select } },
  });
  if (!agenda) throw new Error("No se pudo verificar la agenda de la instalación original.");
  return { scope: { ...ORIGINAL_SCOPE }, professional: agenda.professional };
}
