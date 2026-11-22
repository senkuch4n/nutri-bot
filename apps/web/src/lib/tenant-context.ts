import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { decideTenantAccess, type AccessDenial, type AccessGrant } from "@nutri-bot/core";
import { prisma } from "@nutri-bot/db";
import { LEGACY_TENANT_ID, loadAccessFacts } from "@nutri-bot/db/domain";
import { auth } from "@/auth";

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
  | { ok: false; reason: AccessDenial | "unauthenticated"; email: string | null };

/** Candado transitorio (025a–025c): solo el consultorio original obtiene contexto. Se borra en el último paso de 025c. */
export const ENABLED_TENANT_IDS: readonly string[] = [LEGACY_TENANT_ID];

/** React cache(): una lectura de membresía por request de servidor (entre requests no hay cache).
 *  auth() → session.userId → loadAccessFacts → decideTenantAccess({ enabledTenantIds }) → agenda principal. */
export const getTenantAccess: () => Promise<TenantAccessResult> = cache(async (): Promise<TenantAccessResult> => {
  const session = await auth();
  if (!session) return { ok: false, reason: "unauthenticated", email: null };
  const email = session.user?.email ?? null;

  // Sin userId: conflicto de identidad en el login o JWT anterior a HU-025 (hay que volver a entrar).
  const userId = session.userId;
  if (!userId) return { ok: false, reason: "unlinked", email };

  const decision = decideTenantAccess(await loadAccessFacts(userId, new Date()), {
    enabledTenantIds: ENABLED_TENANT_IDS,
  });
  if (!decision.ok) return { ok: false, reason: decision.reason, email };

  const { tenantId } = decision.grant;
  // Índice parcial único: a lo sumo una agenda principal por tenant; su profesional es del mismo tenant (FK compuesta).
  const agenda = await prisma.agenda.findFirst({
    where: { tenantId, isPrimary: true },
    select: { id: true, professionalId: true },
  });
  if (!agenda) {
    // Un consultorio sin agenda principal no se puede operar: sin contexto, como un tenant no habilitado.
    console.error("[auth] tenant_scope_missing");
    return { ok: false, reason: "tenant_not_enabled", email };
  }

  return {
    ok: true,
    ctx: { userId, tenantId, agendaId: agenda.id, professionalId: agenda.professionalId, access: decision.grant },
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
