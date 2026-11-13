// HU-023: cuenta de Mercado Pago vinculada por OAuth (fila única id = 1). Lo usan web (Ajustes,
// callback, webhook vía payments.ts) y bot (checkout, conciliación, cron de renovación).
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

const ACCOUNT_ID = 1;
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

async function ensureAccountRow(tx: Tx, now: Date): Promise<void> {
  await tx.$executeRaw`INSERT INTO "MercadoPagoAccount" (id, "updatedAt") VALUES (${ACCOUNT_ID}, ${now}) ON CONFLICT (id) DO NOTHING`;
}

/** Orden de locks (anti-deadlock): fila de cuenta → filas de Payment. Nunca al revés. */
async function lockAccountRow(tx: Tx, now: Date): Promise<AccountRow> {
  await ensureAccountRow(tx, now);
  const rows = await tx.$queryRaw<AccountRow[]>`
    SELECT id, "userId", "accessTokenEnc", "refreshTokenEnc", "expiresAt", "errorCode", "errorNotifiedAt"
    FROM "MercadoPagoAccount" WHERE id = ${ACCOUNT_ID} FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new Error("No se pudo leer la cuenta de Mercado Pago");
  return row;
}

/** Marca el incidente con la fila ya bloqueada y encola el aviso (uno por incidente, D5). */
async function markErrorLocked(tx: Tx, row: AccountRow, code: MercadoPagoErrorCode, now: Date): Promise<void> {
  if (row.errorCode || !row.userId) return;
  let notifiedAt: Date | null = row.errorNotifiedAt;
  if (!notifiedAt) {
    const pro = await tx.professional.findUnique({ where: { id: 1 }, select: { phoneJid: true } });
    if (pro?.phoneJid) {
      await tx.outboundMessage.create({
        data: { toJid: pro.phoneJid, kind: "PROFESSIONAL_ALERT", body: messages.MERCADOPAGO_DISCONNECTED_ALERT },
      });
      notifiedAt = now;
    }
  }
  await tx.mercadoPagoAccount.update({
    where: { id: ACCOUNT_ID },
    data: { errorCode: code, errorAt: now, errorNotifiedAt: notifiedAt },
  });
}

/** D6: cancela las señas pendientes que no se pueden cobrar con `keepSellerUserId` y avisa al paciente. */
async function cancelDepositsNotPayableWith(tx: Tx, keepSellerUserId: string | null): Promise<number> {
  const appointments = await tx.appointment.findMany({
    where: { status: "AWAITING_PAYMENT", payments: { some: staleDepositWhere(keepSellerUserId) } },
    include: { patient: true, service: true },
  });
  if (appointments.length === 0) return 0;
  const pro = await tx.professional.findUnique({ where: { id: 1 }, select: { timezone: true } });
  const tz = pro?.timezone ?? "America/Argentina/Buenos_Aires";
  let cancelledCount = 0;
  for (const appointment of appointments) {
    // Mismo orden de lock que expireStalePendingPayments.
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE "appointmentId" = ${appointment.id} ORDER BY id FOR UPDATE`;
    const cancelled = await tx.appointment.updateMany({
      where: { id: appointment.id, status: "AWAITING_PAYMENT" },
      data: { status: "CANCELLED", cancelledBy: "PROFESSIONAL", cancelReason: MERCADOPAGO_ACCOUNT_CHANGED_CANCEL_REASON },
    });
    if (cancelled.count === 0) continue;
    await tx.payment.updateMany({
      where: { appointmentId: appointment.id, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    await tx.outboundMessage.createMany({
      skipDuplicates: true,
      data: [{
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
  tokens: MercadoPagoTokenSet & { userId: string },
  user: { nickname: string | null; email: string | null },
  key: Buffer,
  now: Date,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockAccountRow(tx, now);
    await tx.mercadoPagoAccount.update({
      where: { id: ACCOUNT_ID },
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
    // Si es la misma cuenta no hay nada para cancelar; se llama igual.
    await cancelDepositsNotPayableWith(tx, tokens.userId);
  }, TX_OPTIONS);
}

// ---------------------------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------------------------

/** Panel (web). Sin tokens, sin HTTP, sin descifrar. select explícito sin *Enc. */
export async function getMercadoPagoConnectionView(): Promise<MercadoPagoConnectionView> {
  const [row, pendingDepositCount, depositServices] = await Promise.all([
    prisma.mercadoPagoAccount.findUnique({
      where: { id: ACCOUNT_ID },
      select: { userId: true, nickname: true, email: true, liveMode: true, connectedAt: true, errorCode: true },
    }),
    prisma.payment.count({
      where: { ...staleDepositWhere(null), appointment: { status: "AWAITING_PAYMENT" } },
    }),
    prisma.service.count({ where: { active: true, requiresDeposit: true } }),
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
  sessionEmail: string,
  deps?: MercadoPagoHttpDeps,
): Promise<{ url: string }> {
  const { env, now: nowFn } = resolveDeps(deps);
  const app = getMercadoPagoAppConfig(env);
  if (!app) throw new MercadoPagoConfigError("La conexión con Mercado Pago no está configurada");
  const key = loadMercadoPagoTokenKey(env);
  const now = nowFn();
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(verifier).digest("base64url");

  await prisma.mercadoPagoOAuthState.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.mercadoPagoOAuthState.create({
    data: {
      stateHash: sha256Hex(state),
      codeVerifierEnc: sealSecret(verifier, key, SECRET_AAD.codeVerifier),
      sessionEmail: sessionEmail.trim().toLowerCase(),
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

/** Consume el state en UNA sentencia (un solo uso, atómico). null si no existe, venció o es de otra sesión. */
async function consumeOAuthState(state: string, sessionEmail: string, now: Date): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ codeVerifierEnc: string }[]>`
    DELETE FROM "MercadoPagoOAuthState"
    WHERE "stateHash" = ${sha256Hex(state)} AND "sessionEmail" = ${sessionEmail} AND "expiresAt" > ${now}
    RETURNING "codeVerifierEnc"`;
  return rows[0]?.codeVerifierEnc ?? null;
}

/** Web (ruta callback). Nunca tira por errores de MP: devuelve el resultado para el banner. */
export async function completeMercadoPagoOAuth(
  input: { sessionEmail: string; query: URLSearchParams },
  deps?: MercadoPagoHttpDeps,
): Promise<MercadoPagoCallbackResult> {
  const { http, env, now: nowFn } = resolveDeps(deps);
  const app = getMercadoPagoAppConfig(env);
  if (!app) return "not_configured";
  const key = loadMercadoPagoTokenKey(env);
  const sessionEmail = input.sessionEmail.trim().toLowerCase();
  const now = nowFn();

  const parsed = parseMercadoPagoCallback(input.query);
  if (parsed.kind === "invalid") return "invalid_state";
  if (parsed.kind === "denied") {
    if (parsed.state) await consumeOAuthState(parsed.state, sessionEmail, now);
    return "denied";
  }

  const verifierEnc = await consumeOAuthState(parsed.state, sessionEmail, now);
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

  let user: { nickname: string | null; email: string | null } = { nickname: null, email: null };
  try {
    const me = await fetchMercadoPagoUser(tokens.accessToken, http);
    user = { nickname: me.nickname, email: me.email };
  } catch {
    // /users/me es solo para mostrar qué cuenta está conectada: no bloquea.
  }

  await saveConnection({ ...tokens, userId: tokens.userId }, user, key, nowFn());
  return "connected";
}

/** Web (server action). Borra tokens y datos de la cuenta (conserva missingAlertAt) y aplica D6. */
export async function disconnectMercadoPagoAccount(): Promise<{ cancelledDeposits: number }> {
  const now = new Date();
  const cancelledDeposits = await prisma.$transaction(async (tx) => {
    await lockAccountRow(tx, now);
    await tx.mercadoPagoAccount.update({
      where: { id: ACCOUNT_ID },
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
    return cancelDepositsNotPayableWith(tx, null);
  }, TX_OPTIONS);
  return { cancelledDeposits };
}

/** Web (webhook vía payments.ts) y bot (checkout, conciliación).
 *  scope "current": la cuenta vinculada; scope "payment": la cuenta con la que se creó ese Payment. */
export async function getMercadoPagoCredentials(
  scope: { kind: "current" } | { kind: "payment"; sellerUserId: string | null },
  deps?: MercadoPagoHttpDeps,
): Promise<MercadoPagoCredentials | null> {
  const { env, now: nowFn } = resolveDeps(deps);
  const row = await prisma.mercadoPagoAccount.findUnique({
    where: { id: ACCOUNT_ID },
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
        await markMercadoPagoAccountError("decrypt_failed");
        return null;
      }
      if (!row.expiresAt || isMercadoPagoTokenExpired(row.expiresAt, nowFn())) {
        const result = await refreshMercadoPagoAccountToken({ force: true }, deps);
        if (result !== "refreshed") return null;
        const fresh = await prisma.mercadoPagoAccount.findUnique({
          where: { id: ACCOUNT_ID },
          select: { userId: true, accessTokenEnc: true, errorCode: true },
        });
        if (!fresh?.userId || !fresh.accessTokenEnc || fresh.errorCode || fresh.userId !== row.userId) return null;
        try {
          accessToken = openSecret(fresh.accessTokenEnc, key, SECRET_AAD.accessToken);
        } catch {
          await markMercadoPagoAccountError("decrypt_failed");
          return null;
        }
      }
      return { accessToken, sellerUserId: row.userId!, source: "account" };
    }
  }

  // D3: respaldo explícito de desarrollo (nunca en producción).
  const fallbackApplies =
    (scope.kind === "current" && !hasAccount) || (scope.kind === "payment" && scope.sellerUserId === null);
  if (fallbackApplies && allowsMercadoPagoEnvToken(env)) {
    return { accessToken: env.MERCADOPAGO_ACCESS_TOKEN!.trim(), sellerUserId: null, source: "env_fallback" };
  }
  return null;
}

/** Bot (antes de crear un turno con seña). */
export async function isMercadoPagoCheckoutAvailable(deps?: MercadoPagoHttpDeps): Promise<boolean> {
  return (await getMercadoPagoCredentials({ kind: "current" }, deps)) !== null;
}

/** Bot (cron diario, umbral 30 días) y getMercadoPagoCredentials (al usar, force si ya venció).
 *  El FOR UPDATE serializa web y bot: MP rota el refresh_token en cada renovación. */
export async function refreshMercadoPagoAccountToken(
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
    const row = await lockAccountRow(tx, now);
    if (!row.userId || !row.refreshTokenEnc || !row.accessTokenEnc || row.errorCode) return "not_connected";
    if (row.expiresAt) {
      if (opts.force ? !isMercadoPagoTokenExpired(row.expiresAt, now) : !needsMercadoPagoRefresh(row.expiresAt, now)) {
        return "not_needed";
      }
    }

    let refreshToken: string;
    try {
      refreshToken = openSecret(row.refreshTokenEnc, key, SECRET_AAD.refreshToken);
    } catch {
      await markErrorLocked(tx, row, "decrypt_failed", now);
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
        await markErrorLocked(tx, row, "revoked", now);
        return "revoked";
      }
      await markErrorLocked(tx, row, "refresh_failed", now);
      return "refresh_failed";
    }

    await tx.mercadoPagoAccount.update({
      where: { id: ACCOUNT_ID },
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
export async function markMercadoPagoAccountError(code: MercadoPagoErrorCode): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const row = await lockAccountRow(tx, now);
    await markErrorLocked(tx, row, code, now);
  }, TX_OPTIONS);
}

/** Bot. Aviso "un paciente no pudo reservar porque falta Mercado Pago", máx. 1 cada 24 h (atómico). */
export async function notifyMercadoPagoMissingForBooking(p: {
  patientName: string | null;
  patientPhone: string;
  serviceName: string;
}): Promise<boolean> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - MERCADOPAGO_ALERT_THROTTLE_HOURS * 60 * 60_000);
  return prisma.$transaction(async (tx) => {
    await ensureAccountRow(tx, now);
    const updated = await tx.$queryRaw<{ id: number }[]>`
      UPDATE "MercadoPagoAccount" SET "missingAlertAt" = ${now}, "updatedAt" = ${now}
      WHERE id = ${ACCOUNT_ID} AND ("missingAlertAt" IS NULL OR "missingAlertAt" <= ${cutoff})
      RETURNING id`;
    if (updated.length === 0) return false;
    const pro = await tx.professional.findUnique({ where: { id: 1 }, select: { phoneJid: true } });
    if (!pro?.phoneJid) return false;
    await tx.outboundMessage.create({
      data: {
        toJid: pro.phoneJid,
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
