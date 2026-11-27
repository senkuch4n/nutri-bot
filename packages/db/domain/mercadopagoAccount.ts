// HU-023: cuenta de Mercado Pago vinculada por OAuth. Lo usan web (Ajustes, callback, webhook vía
// payments.ts) y bot (checkout, conciliación, cron de renovación).
// HU-025: toda función recibe el consultorio (`t: TenantRef`) de quien llama (contexto de la sesión en
// web, conversación en el bot). HU-028a: una fila por consultorio (tenantId único); una misma cuenta de
// MP (userId único) no puede estar en dos consultorios (D3a).
// Es el ÚNICO archivo que lee accessTokenEnc / refreshTokenEnc / codeVerifierEnc: nada de eso sale
// de acá en claro salvo el accessToken de MercadoPagoCredentials (server-only, nunca a logs).
import { createHash, randomBytes } from "node:crypto";
import {
  MERCADOPAGO_ACCOUNT_CHANGED_CANCEL_REASON,
  MERCADOPAGO_ALERT_THROTTLE_HOURS,
  MERCADOPAGO_OAUTH_STATE_TTL_MINUTES,
  allowsMercadoPagoEnvToken,
  buildMercadoPagoAuthorizationUrl,
  isMercadoPagoTokenExpired,
  isPlatformMercadoPagoUserId,
  mercadoPagoConnectionStatus,
  messages,
  needsMercadoPagoRefresh,
  parseMercadoPagoCallback,
  requiresLiveMercadoPagoAccount,
  type MercadoPagoCallbackResult,
  type MercadoPagoConnectionStatus,
  type MercadoPagoErrorCode,
  type MercadoPagoTokenSet,
} from "@nutri-bot/core";
import { prisma, type Prisma } from "../index";
import { LEGACY_TENANT_ID } from "./tenantAccess";
import { resolveTenantSchedulingContext, type SchedulingContext, type TenantRef } from "./tenantScope";
import {
  MercadoPagoApiError,
  exchangeMercadoPagoCode,
  fetchMercadoPagoUser,
  getMercadoPagoAppConfig,
  refreshMercadoPagoToken,
  type MercadoPagoHttpDeps,
} from "./mercadopagoOAuthClient";
import {
  MercadoPagoConfigError,
  SECRET_AAD,
  SecretDecryptError,
  loadMercadoPagoTokenKey,
  openSecret,
  sealSecret,
} from "./secretBox";

export { MercadoPagoConfigError } from "./secretBox";
export { MercadoPagoApiError, getMercadoPagoAppConfig } from "./mercadopagoOAuthClient";
export type { MercadoPagoHttpDeps, MercadoPagoAppConfig } from "./mercadopagoOAuthClient";

export class MercadoPagoUnavailableError extends Error {
  constructor(message = "No hay cuenta de Mercado Pago usable") {
    super(message);
    this.name = "MercadoPagoUnavailableError";
  }
}

export type MercadoPagoCredentials = {
  accessToken: string;
  /** user_id de la cuenta; null si viene del token de respaldo del .env (solo dev). */
  sellerUserId: string | null;
  source: "account" | "env_fallback";
};

export type MercadoPagoConnectionView = {
  status: MercadoPagoConnectionStatus;
  userId: string | null;
  nickname: string | null;
  email: string | null;
  liveMode: boolean | null;
  connectedAt: Date | null;
  errorCode: MercadoPagoErrorCode | null;
  /** Señas PENDING de MP con turno AWAITING_PAYMENT y mercadopagoUserId no null (las que D6 cancelaría). */
  pendingDepositCount: number;
  hasActiveDepositServices: boolean;
};

type Tx = Prisma.TransactionClient;

type AccountRow = {
  id: number;
  userId: string | null;
  accessTokenEnc: string | null;
  refreshTokenEnc: string | null;
  expiresAt: Date | null;
  errorCode: string | null;
  errorNotifiedAt: Date | null;
};

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

function resolveDeps(deps: MercadoPagoHttpDeps = {}) {
  return {
    http: deps,
    env: deps.env ?? process.env,
    now: deps.now ?? (() => new Date()),
  };
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isErrorCode(value: string | null): value is MercadoPagoErrorCode {
  return value === "revoked" || value === "refresh_failed" || value === "decrypt_failed";
}

/** Señas que D6 cancela: PENDING de Mercado Pago, creadas con alguna cuenta (no null) distinta de la que queda. */
function staleDepositWhere(keepSellerUserId: string | null): Prisma.PaymentWhereInput {
  return {
    status: "PENDING",
    provider: "mercadopago",
    AND: [
      { mercadopagoUserId: { not: null } },
      ...(keepSellerUserId === null ? [] : [{ NOT: { mercadopagoUserId: keepSellerUserId } }]),
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Internos
// ---------------------------------------------------------------------------------------------

/** HU-028a: crea la fila del consultorio si falta. Cada conflicto consume un valor de la secuencia:
 *  los huecos de id son esperables. */
async function ensureAccountRow(tx: Tx, now: Date, tenantId: string): Promise<void> {
  await tx.$executeRaw`INSERT INTO "MercadoPagoAccount" ("tenantId", "updatedAt") VALUES (${tenantId}, ${now}) ON CONFLICT ("tenantId") DO NOTHING`;
}

type LockedAccount = SchedulingContext & { row: AccountRow | null };

/** Orden de locks (anti-deadlock): fila de cuenta → filas de Payment. Nunca al revés.
 *  create: true → crea la fila del consultorio si falta (saveConnection). create: false → sin fila,
 *  row: null (refresh/markError/disconnect no crean filas). */
async function lockAccountRow(tx: Tx, t: TenantRef, now: Date, opts: { create: boolean }): Promise<LockedAccount> {
  const context = await resolveTenantSchedulingContext(tx, t.tenantId);
  const { tenantId } = context.scope;
  if (opts.create) await ensureAccountRow(tx, now, tenantId);
  const rows = await tx.$queryRaw<AccountRow[]>`
    SELECT id, "userId", "accessTokenEnc", "refreshTokenEnc", "expiresAt", "errorCode", "errorNotifiedAt"
    FROM "MercadoPagoAccount" WHERE "tenantId" = ${tenantId} FOR UPDATE`;
  return { ...context, row: rows[0] ?? null };
}

/** P2002 (unicidad) sobre MercadoPagoAccount.userId: la cuenta quedó en otro consultorio en carrera. */
function isAccountUserIdConflict(error: unknown): boolean {
  const e = error as { code?: unknown; meta?: { target?: unknown } } | null;
  if (e?.code !== "P2002") return false;
  const target = e.meta?.target;
  if (Array.isArray(target)) return target.includes("userId");
  return typeof target === "string" ? target.includes("userId") : false;
}

class AccountInUseError extends Error {}

/** Marca el incidente con la fila ya bloqueada y encola el aviso (uno por incidente, D5). */
async function markErrorLocked(
  tx: Tx,
  { row, scope: { tenantId }, professional }: LockedAccount,
  code: MercadoPagoErrorCode,
  now: Date,
): Promise<void> {
  if (!row || row.errorCode || !row.userId) return;
  let notifiedAt: Date | null = row.errorNotifiedAt;
  if (!notifiedAt && professional.phoneJid) {
    await tx.outboundMessage.create({
      data: { tenantId, toJid: professional.phoneJid, kind: "PROFESSIONAL_ALERT", body: messages.MERCADOPAGO_DISCONNECTED_ALERT },
    });
    notifiedAt = now;
  }
  await tx.mercadoPagoAccount.update({
    where: { tenantId },
    data: { errorCode: code, errorAt: now, errorNotifiedAt: notifiedAt },
  });
}

/** D6: cancela las señas pendientes que no se pueden cobrar con `keepSellerUserId` y avisa al paciente. */
async function cancelDepositsNotPayableWith(
  tx: Tx,
  { scope, professional: { timezone: tz } }: SchedulingContext,
  keepSellerUserId: string | null,
): Promise<number> {
  const { tenantId, agendaId } = scope;
  const appointments = await tx.appointment.findMany({
    where: { ...scope, status: "AWAITING_PAYMENT", payments: { some: staleDepositWhere(keepSellerUserId) } },
    include: { patient: true, service: true },
  });
  let cancelledCount = 0;
  for (const appointment of appointments) {
    // Mismo orden de lock que expireStalePendingPayments.
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE "appointmentId" = ${appointment.id}
      AND EXISTS (SELECT 1 FROM "Appointment" WHERE id = "Payment"."appointmentId"
        AND "tenantId" = ${tenantId} AND "agendaId" = ${agendaId})
      ORDER BY id FOR UPDATE`;
    const cancelled = await tx.appointment.updateMany({
      where: { id: appointment.id, ...scope, status: "AWAITING_PAYMENT" },
      data: { status: "CANCELLED", cancelledBy: "PROFESSIONAL", cancelReason: MERCADOPAGO_ACCOUNT_CHANGED_CANCEL_REASON },
    });
    if (cancelled.count === 0) continue;
    await tx.payment.updateMany({
      where: { appointmentId: appointment.id, status: "PENDING", appointment: scope },
      data: { status: "CANCELLED" },
    });
    await tx.outboundMessage.createMany({
      skipDuplicates: true,
      data: [{
        tenantId,
        toJid: appointment.patient.whatsappJid,
        kind: "CANCELLATION",
        appointmentId: appointment.id,
        body: messages.depositExpired({ serviceName: appointment.service.name, startsAt: appointment.startsAt, tz }),
      }],
    });
    cancelledCount++;
  }
  return cancelledCount;
}

async function saveConnection(
  t: TenantRef,
  tokens: MercadoPagoTokenSet & { userId: string },
  user: { nickname: string | null; email: string | null },
  key: Buffer,
  now: Date,
): Promise<"connected" | "account_in_use"> {
  try {
    await prisma.$transaction(async (tx) => {
      const context = await lockAccountRow(tx, t, now, { create: true });
      try {
        await tx.mercadoPagoAccount.update({
          where: { tenantId: context.scope.tenantId },
          data: {
            userId: tokens.userId,
            nickname: user.nickname,
            email: user.email,
            liveMode: tokens.liveMode,
            accessTokenEnc: sealSecret(tokens.accessToken, key, SECRET_AAD.accessToken),
            refreshTokenEnc: sealSecret(tokens.refreshToken, key, SECRET_AAD.refreshToken),
            scope: tokens.scope,
            expiresAt: tokens.expiresAt,
            connectedAt: now,
            refreshedAt: now,
            errorCode: null,
            errorAt: null,
            errorNotifiedAt: null,
          },
        });
      } catch (error) {
        // D3a en carrera: otro consultorio guardó la misma cuenta entre el pre-chequeo y este update.
        // Se revierte la transacción entera (no se pisan tokens ni se cancelan señas).
        if (isAccountUserIdConflict(error)) throw new AccountInUseError();
        throw error;
      }
      // Si es la misma cuenta no hay nada para cancelar; se llama igual.
      await cancelDepositsNotPayableWith(tx, context, tokens.userId);
    }, TX_OPTIONS);
  } catch (error) {
    if (error instanceof AccountInUseError || isAccountUserIdConflict(error)) return "account_in_use";
    throw error;
  }
  return "connected";
}

// ---------------------------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------------------------

/** Panel (web). Sin tokens, sin HTTP, sin descifrar. select explícito sin *Enc. */
export async function getMercadoPagoConnectionView(t: TenantRef): Promise<MercadoPagoConnectionView> {
  const { scope } = await resolveTenantSchedulingContext(prisma, t.tenantId);
  const [row, pendingDepositCount, depositServices] = await Promise.all([
    prisma.mercadoPagoAccount.findUnique({
      where: { tenantId: scope.tenantId },
      select: { userId: true, nickname: true, email: true, liveMode: true, connectedAt: true, errorCode: true },
    }),
    prisma.payment.count({
      where: { ...staleDepositWhere(null), appointment: { ...scope, status: "AWAITING_PAYMENT" } },
    }),
    prisma.service.count({ where: { tenantId: scope.tenantId, active: true, requiresDeposit: true } }),
  ]);
  const hasAccount = Boolean(row?.userId);
  const errorCode = hasAccount && row && isErrorCode(row.errorCode) ? row.errorCode : null;
  return {
    status: mercadoPagoConnectionStatus({
      configured: getMercadoPagoAppConfig() !== null,
      hasAccount,
      errorCode: hasAccount ? (row?.errorCode ?? null) : null,
    }),
    userId: hasAccount ? (row?.userId ?? null) : null,
    nickname: hasAccount ? (row?.nickname ?? null) : null,
    email: hasAccount ? (row?.email ?? null) : null,
    liveMode: hasAccount ? (row?.liveMode ?? null) : null,
    connectedAt: hasAccount ? (row?.connectedAt ?? null) : null,
    errorCode,
    pendingDepositCount,
    hasActiveDepositServices: depositServices > 0,
  };
}

/** Web (server action). Crea el estado temporal (state hasheado + verifier cifrado) y devuelve la URL de MP. */
export async function startMercadoPagoOAuth(
  t: TenantRef,
  actor: { userId: string },
  deps?: MercadoPagoHttpDeps,
): Promise<{ url: string }> {
  const { env, now: nowFn } = resolveDeps(deps);
  const app = getMercadoPagoAppConfig(env);
  if (!app) throw new MercadoPagoConfigError("La conexión con Mercado Pago no está configurada");
  // Fail closed: un consultorio sin agenda principal no puede empezar un OAuth.
  const { scope } = await resolveTenantSchedulingContext(prisma, t.tenantId);
  const key = loadMercadoPagoTokenKey(env);
  const now = nowFn();
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(verifier).digest("base64url");

  await prisma.mercadoPagoOAuthState.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.mercadoPagoOAuthState.create({
    data: {
      tenantId: scope.tenantId,
      userId: actor.userId,
      stateHash: sha256Hex(state),
      codeVerifierEnc: sealSecret(verifier, key, SECRET_AAD.codeVerifier),
      expiresAt: new Date(now.getTime() + MERCADOPAGO_OAUTH_STATE_TTL_MINUTES * 60_000),
    },
  });
  return {
    url: buildMercadoPagoAuthorizationUrl({
      clientId: app.clientId,
      redirectUri: app.redirectUri,
      state,
      codeChallenge,
    }),
  };
}

/** Consume el state en UNA sentencia (un solo uso, atómico). null si no existe, venció o es de otra
 *  persona u otro consultorio (HU-028a): en ese caso no se consume y sigue siendo de quien lo inició. */
async function consumeOAuthState(
  state: string,
  owner: { userId: string; tenantId: string },
  now: Date,
): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ codeVerifierEnc: string }[]>`
    DELETE FROM "MercadoPagoOAuthState"
    WHERE "stateHash" = ${sha256Hex(state)} AND "userId" = ${owner.userId} AND "tenantId" = ${owner.tenantId}
      AND "expiresAt" > ${now}
    RETURNING "codeVerifierEnc"`;
  return rows[0]?.codeVerifierEnc ?? null;
}

/** Web (ruta callback). Los errores del proveedor se convierten en un resultado para el banner. */
export async function completeMercadoPagoOAuth(
  t: TenantRef,
  input: { userId: string; query: URLSearchParams },
  deps?: MercadoPagoHttpDeps,
): Promise<MercadoPagoCallbackResult> {
  const { http, env, now: nowFn } = resolveDeps(deps);
  const app = getMercadoPagoAppConfig(env);
  if (!app) return "not_configured";
  const key = loadMercadoPagoTokenKey(env);
  const now = nowFn();

  const parsed = parseMercadoPagoCallback(input.query);
  if (parsed.kind === "invalid") return "invalid_state";
  const { scope: { tenantId } } = await resolveTenantSchedulingContext(prisma, t.tenantId);
  const owner = { userId: input.userId, tenantId };
  if (parsed.kind === "denied") {
    if (parsed.state) await consumeOAuthState(parsed.state, owner, now);
    return "denied";
  }

  const verifierEnc = await consumeOAuthState(parsed.state, owner, now);
  if (!verifierEnc) return "invalid_state";
  let codeVerifier: string;
  try {
    codeVerifier = openSecret(verifierEnc, key, SECRET_AAD.codeVerifier);
  } catch {
    return "invalid_state";
  }

  let tokens: MercadoPagoTokenSet;
  try {
    tokens = await exchangeMercadoPagoCode({ code: parsed.code, codeVerifier, app }, { ...http, now: nowFn });
  } catch (error) {
    const status = error instanceof MercadoPagoApiError ? error.status : undefined;
    const code = error instanceof MercadoPagoApiError ? error.code : null;
    console.error("[mercadopago] oauth_exchange_failed", { status, code });
    return "rejected";
  }
  if (!tokens.userId) return "rejected";
  if (requiresLiveMercadoPagoAccount(env) && tokens.liveMode !== true) return "wrong_environment";
  // HU-028a: la cuenta de cobro de Arzium (HU-029) nunca se guarda como cuenta de señas. Los tokens
  // canjeados de una cuenta rechazada se descartan (ni se guardan ni se loguean).
  if (isPlatformMercadoPagoUserId(tokens.userId, env)) return "rejected";
  // D3a: la cuenta ya está conectada en otro consultorio.
  const inUse = await prisma.mercadoPagoAccount.findFirst({
    where: { userId: tokens.userId, NOT: { tenantId } },
    select: { id: true },
  });
  if (inUse) return "account_in_use";

  let user: { nickname: string | null; email: string | null } = { nickname: null, email: null };
  try {
    const me = await fetchMercadoPagoUser(tokens.accessToken, http);
    user = { nickname: me.nickname, email: me.email };
  } catch {
    // /users/me es solo para mostrar qué cuenta está conectada: no bloquea.
  }

  return saveConnection({ tenantId }, { ...tokens, userId: tokens.userId }, user, key, nowFn());
}

/** Web (server action). Borra tokens y datos de la cuenta (conserva missingAlertAt) y aplica D6. */
export async function disconnectMercadoPagoAccount(t: TenantRef): Promise<{ cancelledDeposits: number }> {
  const now = new Date();
  const cancelledDeposits = await prisma.$transaction(async (tx) => {
    const context = await lockAccountRow(tx, t, now, { create: false });
    // Sin fila no hay cuenta ni señas de una cuenta para cancelar: no se escribe nada.
    if (!context.row) return 0;
    await tx.mercadoPagoAccount.update({
      where: { tenantId: context.scope.tenantId },
      data: {
        userId: null,
        nickname: null,
        email: null,
        liveMode: null,
        accessTokenEnc: null,
        refreshTokenEnc: null,
        scope: null,
        expiresAt: null,
        connectedAt: null,
        refreshedAt: null,
        errorCode: null,
        errorAt: null,
        errorNotifiedAt: null,
      },
    });
    return cancelDepositsNotPayableWith(tx, context, null);
  }, TX_OPTIONS);
  return { cancelledDeposits };
}

/** Web (webhook vía payments.ts) y bot (checkout, conciliación).
 *  scope "current": la cuenta vinculada; scope "payment": la cuenta con la que se creó ese Payment. */
export async function getMercadoPagoCredentials(
  t: TenantRef,
  scope: { kind: "current" } | { kind: "payment"; sellerUserId: string | null },
  deps?: MercadoPagoHttpDeps,
): Promise<MercadoPagoCredentials | null> {
  const { env, now: nowFn } = resolveDeps(deps);
  const context = await resolveTenantSchedulingContext(prisma, t.tenantId).catch(() => null);
  if (!context) return null;
  const { tenantId } = context.scope;
  const accountWhere = { tenantId };
  const row = await prisma.mercadoPagoAccount.findUnique({
    where: accountWhere,
    select: { userId: true, accessTokenEnc: true, refreshTokenEnc: true, expiresAt: true, errorCode: true },
  });
  const hasAccount = Boolean(row?.userId && row.accessTokenEnc && row.refreshTokenEnc);

  if (row && hasAccount && !row.errorCode) {
    const paymentSeller = scope.kind === "payment" ? scope.sellerUserId : undefined;
    if (paymentSeller !== null) {
      if (paymentSeller !== undefined && paymentSeller !== row.userId) return null;
      let key: Buffer;
      try {
        key = loadMercadoPagoTokenKey(env);
      } catch {
        // Falta la clave: problema de configuración (Ajustes muestra "No disponible"), no del token.
        return null;
      }
      let accessToken: string;
      try {
        accessToken = openSecret(row.accessTokenEnc!, key, SECRET_AAD.accessToken);
      } catch (error) {
        if (!(error instanceof SecretDecryptError)) throw error;
        await markMercadoPagoAccountError(t, "decrypt_failed");
        return null;
      }
      if (!row.expiresAt || isMercadoPagoTokenExpired(row.expiresAt, nowFn())) {
        const result = await refreshMercadoPagoAccountToken(t, { force: true }, deps);
        if (result !== "refreshed") return null;
        const fresh = await prisma.mercadoPagoAccount.findUnique({
          where: accountWhere,
          select: { userId: true, accessTokenEnc: true, errorCode: true },
        });
        if (!fresh?.userId || !fresh.accessTokenEnc || fresh.errorCode || fresh.userId !== row.userId) return null;
        try {
          accessToken = openSecret(fresh.accessTokenEnc, key, SECRET_AAD.accessToken);
        } catch {
          await markMercadoPagoAccountError(t, "decrypt_failed");
          return null;
        }
      }
      return { accessToken, sellerUserId: row.userId!, source: "account" };
    }
  }

  // D3: respaldo explícito de desarrollo (nunca en producción), solo del consultorio original (HU-028a).
  const fallbackApplies =
    (scope.kind === "current" && !hasAccount) || (scope.kind === "payment" && scope.sellerUserId === null);
  if (fallbackApplies && allowsMercadoPagoEnvToken(env) && tenantId === LEGACY_TENANT_ID) {
    return { accessToken: env.MERCADOPAGO_ACCESS_TOKEN!.trim(), sellerUserId: null, source: "env_fallback" };
  }
  return null;
}

/** Bot (antes de crear un turno con seña). */
export async function isMercadoPagoCheckoutAvailable(t: TenantRef, deps?: MercadoPagoHttpDeps): Promise<boolean> {
  return (await getMercadoPagoCredentials(t, { kind: "current" }, deps)) !== null;
}

/** Bot (cron diario, umbral 30 días) y getMercadoPagoCredentials (al usar, force si ya venció).
 *  El FOR UPDATE serializa web y bot: MP rota el refresh_token en cada renovación. */
export async function refreshMercadoPagoAccountToken(
  t: TenantRef,
  opts: { force?: boolean } = {},
  deps?: MercadoPagoHttpDeps,
): Promise<"refreshed" | "not_needed" | "not_connected" | "transient_error" | "revoked" | "refresh_failed"> {
  const { http, env, now: nowFn } = resolveDeps(deps);
  const app = getMercadoPagoAppConfig(env);
  if (!app) return "not_connected";
  const key = loadMercadoPagoTokenKey(env);

  return prisma.$transaction(async (tx) => {
    const now = nowFn();
    // Releer con el lock tomado: otro proceso pudo haber renovado mientras esperábamos.
    const context = await lockAccountRow(tx, t, now, { create: false });
    const { row } = context;
    if (!row || !row.userId || !row.refreshTokenEnc || !row.accessTokenEnc || row.errorCode) return "not_connected";
    if (row.expiresAt) {
      if (opts.force ? !isMercadoPagoTokenExpired(row.expiresAt, now) : !needsMercadoPagoRefresh(row.expiresAt, now)) {
        return "not_needed";
      }
    }

    let refreshToken: string;
    try {
      refreshToken = openSecret(row.refreshTokenEnc, key, SECRET_AAD.refreshToken);
    } catch {
      await markErrorLocked(tx, context, "decrypt_failed", now);
      return "refresh_failed";
    }

    let tokens: MercadoPagoTokenSet;
    try {
      tokens = await refreshMercadoPagoToken({ refreshToken, app }, { ...http, now: nowFn });
    } catch (error) {
      const apiError = error instanceof MercadoPagoApiError ? error : null;
      console.error("[mercadopago] refresh_failed", { status: apiError?.status, code: apiError?.code ?? null });
      const kind = apiError?.kind ?? "transient";
      if (kind === "transient") return "transient_error";
      if (kind === "revoked") {
        await markErrorLocked(tx, context, "revoked", now);
        return "revoked";
      }
      await markErrorLocked(tx, context, "refresh_failed", now);
      return "refresh_failed";
    }

    await tx.mercadoPagoAccount.update({
      where: { tenantId: context.scope.tenantId },
      data: {
        accessTokenEnc: sealSecret(tokens.accessToken, key, SECRET_AAD.accessToken),
        refreshTokenEnc: sealSecret(tokens.refreshToken, key, SECRET_AAD.refreshToken),
        expiresAt: tokens.expiresAt,
        ...(tokens.scope ? { scope: tokens.scope } : {}),
        ...(tokens.liveMode !== null ? { liveMode: tokens.liveMode } : {}),
        refreshedAt: now,
      },
    });
    return "refreshed";
  }, TX_OPTIONS);
}

/** Web y bot. Marca el incidente (si ya hay uno, no cambia nada) y encola el aviso una vez. */
export async function markMercadoPagoAccountError(t: TenantRef, code: MercadoPagoErrorCode): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const context = await lockAccountRow(tx, t, now, { create: false });
    await markErrorLocked(tx, context, code, now);
  }, TX_OPTIONS);
}

/** Bot. Aviso "un paciente no pudo reservar porque falta Mercado Pago", máx. 1 cada 24 h (atómico). */
export async function notifyMercadoPagoMissingForBooking(t: TenantRef, p: {
  patientName: string | null;
  patientPhone: string;
  serviceName: string;
}): Promise<boolean> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - MERCADOPAGO_ALERT_THROTTLE_HOURS * 60 * 60_000);
  return prisma.$transaction(async (tx) => {
    const { scope: { tenantId }, professional } = await resolveTenantSchedulingContext(tx, t.tenantId);
    await ensureAccountRow(tx, now, tenantId);
    // HU-028a: cada consultorio tiene su propio tope (su propia fila).
    const updated = await tx.$queryRaw<{ id: number }[]>`
      UPDATE "MercadoPagoAccount" SET "missingAlertAt" = ${now}, "updatedAt" = ${now}
      WHERE "tenantId" = ${tenantId}
        AND ("missingAlertAt" IS NULL OR "missingAlertAt" <= ${cutoff})
      RETURNING id`;
    if (updated.length === 0 || !professional.phoneJid) return false;
    await tx.outboundMessage.create({
      data: {
        tenantId,
        toJid: professional.phoneJid,
        kind: "PROFESSIONAL_ALERT",
        body: messages.professionalDepositUnavailableAlert({
          patientName: p.patientName,
          patientPhone: p.patientPhone,
          serviceName: p.serviceName,
        }),
      },
    });
    return true;
  });
}

/** Webhook público (payments.ts, sin sesión). HU-028a: la cuenta sale del `user_id` de la notificación
 *  (ya parseado); el llamador re-verifica consultando el pago con el token de esa cuenta y exigiendo que el
 *  Payment local sea de ese consultorio y de ese vendedor. Sin cuenta conocida → null. El respaldo de
 *  desarrollo del .env es solo del consultorio original y solo si ninguna fila tiene ese user_id. */
export async function resolveMercadoPagoWebhookAccount(
  notifiedUserId: string | null,
  env: Record<string, string | undefined> = process.env,
): Promise<{ tenant: TenantRef; sellerUserId: string | null } | null> {
  if (notifiedUserId !== null) {
    const row = await prisma.mercadoPagoAccount.findUnique({
      where: { userId: notifiedUserId },
      select: { tenantId: true, userId: true, accessTokenEnc: true },
    });
    if (row?.userId && row.accessTokenEnc) return { tenant: { tenantId: row.tenantId }, sellerUserId: row.userId };
    if (row) return null;
  }
  if (allowsMercadoPagoEnvToken(env)) return { tenant: { tenantId: LEGACY_TENANT_ID }, sellerUserId: null };
  return null;
}

/** Bot (crons de conciliación y renovación): consultorios con cuenta vinculada, orden por tenantId. */
export async function listConnectedMercadoPagoTenants(): Promise<TenantRef[]> {
  const rows = await prisma.mercadoPagoAccount.findMany({
    where: { userId: { not: null } },
    select: { tenantId: true },
    orderBy: { tenantId: "asc" },
  });
  return rows.map(({ tenantId }) => ({ tenantId }));
}
