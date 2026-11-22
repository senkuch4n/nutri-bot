// HU-025: decisión pura de acceso a un consultorio. Sin base ni red: los hechos los lee
// `loadAccessFacts` (packages/db/domain/tenantAccess.ts) en cada request.

export type MembershipRole = "OWNER" | "STAFF";
export type SupportMode = "READ_ONLY" | "READ_WRITE";

/** Hechos leídos de la base para un User; null = el User no existe. */
export type AccessFacts = {
  /** User.googleSubject no nulo. */
  linked: boolean;
  /** Como mucho 2 (take: 2): alcanza para detectar ambigüedad. */
  memberships: { tenantId: string; role: MembershipRole }[];
  /** 025a: siempre false. */
  platformOperator: boolean;
  /** 025a: siempre []. */
  activeSupportGrants: { id: string; tenantId: string; mode: SupportMode; expiresAt: Date }[];
};

export type AccessDenial =
  | "unlinked" // sin User o sin googleSubject
  | "no_membership" // identidad pendiente
  | "multiple_memberships" // D7
  | "tenant_not_enabled" // candado transitorio: tenant fuera de enabledTenantIds
  | "support_no_grant" // operador de plataforma sin permiso vigente
  | "support_multiple_grants"; // defensa: el script impide >1 vigente

export type AccessGrant =
  | { kind: "member"; tenantId: string; role: MembershipRole }
  | { kind: "support"; tenantId: string; grantId: string; mode: SupportMode; expiresAt: Date };

export type AccessDecision = { ok: true; grant: AccessGrant } | { ok: false; reason: AccessDenial };

/** Precedencia: con ≥1 membresía manda la membresía (un permiso de soporte no se suma).
 *  Sin membresía y operador activo: exactamente un permiso vigente.
 *
 *  025a: el acceso de plataforma todavía no existe (llega en 025d), así que un User sin
 *  membresía siempre queda como identidad pendiente (`no_membership`), aunque los hechos
 *  dijeran otra cosa. Falla cerrado. */
export function decideTenantAccess(
  facts: AccessFacts | null,
  opts?: { enabledTenantIds?: readonly string[] },
): AccessDecision {
  if (!facts || !facts.linked) return { ok: false, reason: "unlinked" };
  const { memberships } = facts;
  if (memberships.length > 1) return { ok: false, reason: "multiple_memberships" };
  const [membership] = memberships;
  if (!membership) return { ok: false, reason: "no_membership" };
  if (membership.role !== "OWNER" && membership.role !== "STAFF") {
    // Defensa ante un rol desconocido que llegue desde la base: sin acceso.
    return { ok: false, reason: "no_membership" };
  }
  const enabled = opts?.enabledTenantIds;
  if (enabled && !enabled.includes(membership.tenantId)) {
    return { ok: false, reason: "tenant_not_enabled" };
  }
  return { ok: true, grant: { kind: "member", tenantId: membership.tenantId, role: membership.role } };
}

/** trim + toLowerCase. Misma regla que legacy-memberships.ts (HU-024). */
export function canonicalEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** GET que escriben aunque sean navegación (lista cerrada). */
const MUTATING_GET_PATHS: readonly string[] = ["/api/mercadopago/oauth/callback"];

/** 025a: ¿la request modifica algo? Server action (header next-action), método distinto de GET/HEAD,
 *  o una ruta GET que escribe (lista cerrada: "/api/mercadopago/oauth/callback"). */
export function isMutatingPanelRequest(r: { method: string; pathname: string; isServerAction: boolean }): boolean {
  if (r.isServerAction) return true;
  const method = r.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return true;
  const path = r.pathname.length > 1 ? r.pathname.replace(/\/+$/, "") : r.pathname;
  return MUTATING_GET_PATHS.includes(path);
}
