import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { type AccessDenial, type AccessGrant } from "@nutri-bot/core";
import { prisma } from "@nutri-bot/db";
import { LEGACY_TENANT_ID, TenantScopeError, loadAccessFacts, resolvePrimaryAgenda } from "@nutri-bot/db/domain";
import { auth } from "@/auth";
import { createOnboardingAccessAdapter } from "./onboarding-access-adapter";
import { loadOnboardedClinic } from "./onboarding-server";
import { getTenantSubscriptionGate } from "./onboarding-subscription-gate";

// HU-025 (4.5 de la SDD): el consultorio de cada request de servidor sale de acá, nunca del cliente.
// Se lee la sesión (solo `userId`), los hechos de acceso en la base y la agenda principal del tenant.
// Nada de este archivo lee query, body, cookies propias ni headers: el tenant no viaja en la request.

export type TenantContext = {
  userId: string;
  tenantId: string;
  agendaId: string;
  professionalId: number;
  access: AccessGrant; // { kind: "member", role } | { kind: "support", grantId, mode, expiresAt }
};

export type TenantAccessResult =
  | { ok: true; ctx: TenantContext }
  | { ok: false; reason: AccessDenial | "unauthenticated"; email: string | null }
  | { ok: false; reason: "onboarding_setup"; clinicName: string; timeZone: string; email: string | null }
  | { ok: false; reason: "onboarding_pending"; clinicName: string; email: string | null };

/** Candado transitorio (025a–025c): consultorios existentes que operan sin pasar por el alta nueva. */
export const ENABLED_TENANT_IDS: readonly string[] = [LEGACY_TENANT_ID];

/** React cache(): una lectura de membresía por request de servidor (entre requests no hay cache).
 *  auth() → session.userId → loadAccessFacts → onboarding/suscripción → agenda principal. */
export const getTenantAccess: () => Promise<TenantAccessResult> = cache(async (): Promise<TenantAccessResult> => {
  const session = await auth();
  if (!session) return { ok: false, reason: "unauthenticated", email: null };
  const email = session.user?.email ?? null;

  // Sin userId: conflicto de identidad en el login o JWT anterior a HU-025 (hay que volver a entrar).
  const userId = session.userId;
  if (!userId) return { ok: false, reason: "unlinked", email };

  const access = await createOnboardingAccessAdapter({
    readSession: async () => ({ userId }),
    loadAccessFacts: (uid) => loadAccessFacts(uid, new Date()),
    existingEnabledTenantIds: ENABLED_TENANT_IDS,
    loadOnboardedClinic,
    getTenantSubscriptionGate,
  }).resolve();

  if (access.kind === "setup") {
    return { ok: false, reason: "onboarding_setup", clinicName: access.clinicName, timeZone: access.timeZone, email };
  }
  if (access.kind === "onboarding") {
    return { ok: false, reason: "onboarding_pending", clinicName: access.clinicName, email };
  }
  if (access.kind === "denied") {
    const reason = access.reason === "subscription_pending" ? "tenant_not_enabled" : access.reason;
    return { ok: false, reason, email };
  }

  const { tenantId } = access.grant;
  // HU-025b-2: la misma resolución de agenda principal que usa el dominio (tenantScope.resolvePrimaryAgenda,
  // la base de resolveTenantSchedulingContext): índice parcial único y profesional del mismo tenant por FK
  // compuesta. Se usa la primitiva porque el contexto necesita también professionalId.
  let primary: { scope: { agendaId: string }; professionalId: number };
  try {
    primary = await resolvePrimaryAgenda(prisma, tenantId, { id: true } as const);
  } catch (error) {
    if (!(error instanceof TenantScopeError)) throw error;
    // Un consultorio sin agenda principal no se puede operar: sin contexto, como un tenant no habilitado.
    console.error("[auth] tenant_scope_missing");
    return { ok: false, reason: "tenant_not_enabled", email };
  }

  return {
    ok: true,
    ctx: { userId, tenantId, agendaId: primary.scope.agendaId, professionalId: primary.professionalId, access: access.grant },
  };
});

export async function getTenantContext(): Promise<TenantContext | null> {
  const result = await getTenantAccess();
  return result.ok ? result.ctx : null;
}

export type TenantAccessErrorCode = "no_context" | "read_only" | "owner_only" | "blocked_in_support";

export class TenantAccessError extends Error {
  readonly code: TenantAccessErrorCode;
  constructor(code: TenantAccessErrorCode) {
    super(`tenant_access:${code}`);
    this.name = "TenantAccessError";
    this.code = code;
  }
}

/** Server actions y rutas API. "write" rechazará el soporte READ_ONLY (025d); en 025a no hay soporte,
 *  así que el modo todavía no cambia el resultado. */
export async function requireTenantContext(mode: "read" | "write" = "write"): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) throw new TenantAccessError("no_context");
  if (mode === "write" && ctx.access.kind === "support" && ctx.access.mode === "READ_ONLY") {
    // 025a: inalcanzable (decideTenantAccess no da soporte todavía). Falla cerrado si llegara a aparecer.
    throw new TenantAccessError("read_only");
  }
  return ctx;
}

/** Equipo. Solo kind "member" con role OWNER; soporte nunca. */
export async function requireOwnerContext(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) throw new TenantAccessError("no_context");
  if (ctx.access.kind !== "member" || ctx.access.role !== "OWNER") throw new TenantAccessError("owner_only");
  return ctx;
}

/** Server components: redirect("/inicio") si no hay contexto. */
export async function requirePageContext(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/inicio");
  return ctx;
}
