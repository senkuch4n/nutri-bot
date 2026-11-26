// HU-028b: conexión de Google Calendar por consultorio (D5a) con un OAuth propio, separado del login (D15).
// Lo usan web (Ajustes, callback) y bot (lista de consultorios para el cron de sync).
// Junto con gcal.ts, es el ÚNICO archivo que lee refreshTokenEnc / codeVerifierEnc. Nada de eso sale de
// acá en claro: ni al navegador, ni a los logs, ni a la IA. Calendar es solo escritura (D15).
import { createHash, randomBytes } from "node:crypto";
import {
  GOOGLE_CALENDAR_OAUTH_STATE_TTL_MINUTES,
  buildGoogleCalendarAuthorizationUrl,
  decideGoogleCalendarConnection,
  hasGoogleCalendarEventsScope,
  parseGoogleCalendarCallback,
  parseGoogleIdTokenClaims,
  parseGoogleTokenResponse,
  type GoogleCalendarCallbackResult,
  type GoogleCalendarConnectionKind,
  type GoogleCalendarConnectionStatus,
} from "@nutri-bot/core";
import { prisma, type Prisma } from "../index";
import {
  GoogleCalendarConfigError,
  GoogleOAuthApiError,
  exchangeGoogleAuthorizationCode,
  getGoogleCalendarAppConfig,
  revokeGoogleToken,
  type GoogleOAuthHttpDeps,
} from "./googleOAuthClient";
import { GOOGLE_SECRET_AAD, loadIntegrationTokenKey, openSecret, sealSecret } from "./secretBox";
import { resolveTenantCalendarContext, resolveTenantSchedulingContext, type TenantRef } from "./tenantScope";

export type GoogleCalendarConnectionView = {
  status: GoogleCalendarConnectionStatus;
  googleEmail: string | null; // solo si connected
  calendarId: string | null; // solo si connected; null = principal
  syncError: string | null; // solo si connected
  connectedAt: Date | null; // solo si connected
}; // NUNCA refreshTokenEnc, googleSubject ni scope.

type Tx = Prisma.TransactionClient;

type LockedRow = {
  refreshTokenEnc: string | null;
  googleSubject: string | null;
  calendarId: string | null;
  connectedAt: Date | null;
};

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

function resolveDeps(deps: GoogleOAuthHttpDeps = {}) {
  return { http: deps, env: deps.env ?? process.env, now: deps.now ?? (() => new Date()) };
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Id con forma de cuid (25 caracteres, prefijo "c") para el INSERT crudo; la columna es TEXT. */
function newRowId(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

/** Descifra el refresh token guardado; null si no hay o no abre (clave cambiada, AAD de otro tenant). */
function tryOpenRefreshToken(enc: string | null, key: Buffer | null, tenantId: string): string | null {
  if (!enc || !key) return null;
  try {
    return openSecret(enc, key, GOOGLE_SECRET_AAD.refreshToken(tenantId));
  } catch {
    return null;
  }
}

function tryLoadKey(env: Record<string, string | undefined>): Buffer | null {
  try {
    return loadIntegrationTokenKey(env);
  } catch {
    return null;
  }
}

async function lockRow(tx: Tx, tenantId: string): Promise<LockedRow | null> {
  const rows = await tx.$queryRaw<LockedRow[]>`
    SELECT "refreshTokenEnc", "googleSubject", "calendarId", "connectedAt"
    FROM "GoogleCalendarAccount" WHERE "tenantId" = ${tenantId} FOR UPDATE`;
  return rows[0] ?? null;
}

/** El texto plano viejo (HU-024) de la profesional de la agenda principal: se borra al conectar o
 *  desconectar con el flujo nuevo. Las columnas se eliminan en 028b-2. */
async function clearLegacyPlaintext(tx: Tx, tenantId: string, professionalId: number): Promise<void> {
  await tx.professional.updateMany({
    where: { id: professionalId, tenantId },
    data: { googleRefreshToken: null, googleSyncError: null },
  });
}

/** Un solo uso, atómico. null si no existe, venció o es de otra persona u otro consultorio: en ese caso
 *  no se consume y sigue siendo de quien lo inició. */
async function consumeGoogleOAuthState(
  state: string,
  owner: { userId: string; tenantId: string },
  now: Date,
): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ codeVerifierEnc: string }[]>`
    DELETE FROM "GoogleCalendarOAuthState"
    WHERE "stateHash" = ${sha256Hex(state)} AND "userId" = ${owner.userId} AND "tenantId" = ${owner.tenantId}
      AND "expiresAt" > ${now}
    RETURNING "codeVerifierEnc"`;
  return rows[0]?.codeVerifierEnc ?? null;
}

/** D8, en una transacción. Devuelve el token anterior (descifrado) solo si la cuenta cambió, para
 *  revocarlo después del commit. */
async function saveGoogleCalendarConnection(
  t: TenantRef,
  conn: { refreshToken: string; subject: string; email: string; scope: string | null },
  key: Buffer,
  now: Date,
): Promise<{ kind: GoogleCalendarConnectionKind; previousRefreshToken: string | null }> {
  return prisma.$transaction(async (tx) => {
    const { scope, agendaOwner } = await resolveTenantCalendarContext(tx, t.tenantId);
    const { tenantId, agendaId } = scope;
    await tx.$executeRaw`INSERT INTO "GoogleCalendarAccount" ("id", "tenantId", "updatedAt")
      VALUES (${newRowId()}, ${tenantId}, ${now}) ON CONFLICT ("tenantId") DO NOTHING`;
    const row = await lockRow(tx, tenantId);
    if (!row) throw new Error("google_calendar_account_missing");

    const kind = decideGoogleCalendarConnection({
      hadConnection: row.connectedAt !== null,
      previousSubject: row.googleSubject,
      nextSubject: conn.subject,
    });
    const appointmentScope = { tenantId, agendaId };

    if (kind === "changed") {
      // D8: otra cuenta. Se olvidan los eventos del calendario anterior y se recrean los turnos futuros.
      await tx.appointment.updateMany({
        where: { ...appointmentScope, googleEventId: { not: null } },
        data: { googleEventId: null, needsGoogleSync: false },
      });
      await tx.appointment.updateMany({
        where: { ...appointmentScope, status: "CONFIRMED", startsAt: { gte: now } },
        data: { needsGoogleSync: true },
      });
    }
    if (kind === "first" || kind === "changed") {
      // Al conectar una cuenta nueva solo van al calendario los turnos futuros.
      await tx.appointment.updateMany({
        where: { ...appointmentScope, googleEventId: null, startsAt: { lt: now }, needsGoogleSync: true },
        data: { needsGoogleSync: false },
      });
    }
    // same: no toca turnos; lo encolado mientras estuvo desconectado se sincroniza contra los mismos eventos.

    await tx.googleCalendarAccount.update({
      where: { tenantId },
      data: {
        refreshTokenEnc: sealSecret(conn.refreshToken, key, GOOGLE_SECRET_AAD.refreshToken(tenantId)),
        googleSubject: conn.subject,
        googleEmail: conn.email,
        scope: conn.scope,
        connectedAt: now,
        disconnectedAt: null,
        syncError: null,
        syncErrorAt: null,
        // El calendario elegido era de la otra cuenta.
        calendarId: kind === "changed" ? null : row.calendarId,
      },
    });
    await clearLegacyPlaintext(tx, tenantId, agendaOwner.professionalId);

    // En "same" NO se revoca el anterior: en Google revocar un token revoca la autorización entera de la
    // cuenta para el cliente, incluido el token nuevo.
    const previousRefreshToken = kind === "changed" ? tryOpenRefreshToken(row.refreshTokenEnc, key, tenantId) : null;
    return { kind, previousRefreshToken };
  }, TX_OPTIONS);
}

// ---------------------------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------------------------

/** Web (Ajustes). Sin tokens, sin HTTP, sin descifrar: la consulta no trae la columna cifrada. */
export async function getGoogleCalendarConnectionView(
  t: TenantRef,
  env: Record<string, string | undefined> = process.env,
): Promise<GoogleCalendarConnectionView> {
  const empty = { googleEmail: null, calendarId: null, syncError: null, connectedAt: null };
  if (!getGoogleCalendarAppConfig(env)) return { status: "not_configured", ...empty };
  const [row, connectedCount] = await Promise.all([
    prisma.googleCalendarAccount.findUnique({
      where: { tenantId: t.tenantId },
      select: { googleEmail: true, calendarId: true, syncError: true, connectedAt: true },
    }),
    prisma.googleCalendarAccount.count({ where: { tenantId: t.tenantId, refreshTokenEnc: { not: null } } }),
  ]);
  if (!row || connectedCount === 0) return { status: "not_connected", ...empty };
  return {
    status: "connected",
    googleEmail: row.googleEmail,
    calendarId: row.calendarId,
    syncError: row.syncError,
    connectedAt: row.connectedAt,
  };
}

/** Web (server action). Crea el state (hasheado) + verifier (cifrado con el AAD del consultorio) y
 *  devuelve la URL de Google. Tira GoogleCalendarConfigError si falta configuración. */
export async function startGoogleCalendarOAuth(
  t: TenantRef,
  actor: { userId: string },
  deps?: GoogleOAuthHttpDeps,
): Promise<{ url: string }> {
  const { env, now: nowFn } = resolveDeps(deps);
  const app = getGoogleCalendarAppConfig(env);
  if (!app) throw new GoogleCalendarConfigError();
  // Fail closed: un consultorio sin agenda principal no puede empezar un OAuth.
  const { scope } = await resolveTenantSchedulingContext(prisma, t.tenantId);
  const key = loadIntegrationTokenKey(env);
  const now = nowFn();
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(verifier).digest("base64url");

  await prisma.googleCalendarOAuthState.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.googleCalendarOAuthState.create({
    data: {
      tenantId: scope.tenantId,
      userId: actor.userId,
      stateHash: sha256Hex(state),
      codeVerifierEnc: sealSecret(verifier, key, GOOGLE_SECRET_AAD.codeVerifier(scope.tenantId)),
      expiresAt: new Date(now.getTime() + GOOGLE_CALENDAR_OAUTH_STATE_TTL_MINUTES * 60_000),
    },
  });
  return {
    url: buildGoogleCalendarAuthorizationUrl({
      clientId: app.clientId,
      redirectUri: app.redirectUri,
      state,
      codeChallenge,
    }),
  };
}

/** Web (ruta callback). Nunca loguea el query, el code, el verifier ni los tokens; el access_token que
 *  devuelve Google se descarta. */
export async function completeGoogleCalendarOAuth(
  t: TenantRef,
  input: { userId: string; query: URLSearchParams },
  deps?: GoogleOAuthHttpDeps,
): Promise<GoogleCalendarCallbackResult> {
  const { http, env, now: nowFn } = resolveDeps(deps);
  const app = getGoogleCalendarAppConfig(env);
  if (!app) return "not_configured";
  const key = loadIntegrationTokenKey(env);
  const now = nowFn();

  const parsed = parseGoogleCalendarCallback(input.query);
  if (parsed.kind === "invalid") return "invalid_state";
  if (parsed.kind === "denied") {
    if (parsed.state) await consumeGoogleOAuthState(parsed.state, { userId: input.userId, tenantId: t.tenantId }, now);
    return "denied";
  }

  // Fail closed (tira): la ruta lo convierte en "rejected".
  const { scope: { tenantId } } = await resolveTenantSchedulingContext(prisma, t.tenantId);
  const verifierEnc = await consumeGoogleOAuthState(parsed.state, { userId: input.userId, tenantId }, now);
  if (!verifierEnc) return "invalid_state";
  let codeVerifier: string;
  try {
    codeVerifier = openSecret(verifierEnc, key, GOOGLE_SECRET_AAD.codeVerifier(tenantId));
  } catch {
    return "invalid_state";
  }

  let raw: unknown;
  try {
    raw = await exchangeGoogleAuthorizationCode(app, { code: parsed.code, codeVerifier }, http);
  } catch (error) {
    const status = error instanceof GoogleOAuthApiError ? error.status : undefined;
    const code = error instanceof GoogleOAuthApiError ? error.code : null;
    console.error("[google-calendar] oauth_exchange_failed", { status, code });
    return "rejected";
  }
  // Sin refresh token no hay sync posible.
  const tokens = parseGoogleTokenResponse(raw);
  if (!tokens) return "rejected";
  if (!hasGoogleCalendarEventsScope(tokens.scope)) {
    await revokeGoogleToken(tokens.refreshToken, http);
    return "scope_denied";
  }
  const claims = parseGoogleIdTokenClaims(tokens.idToken, { clientId: app.clientId, now: nowFn() });
  if (!claims) {
    await revokeGoogleToken(tokens.refreshToken, http);
    return "rejected";
  }

  const saved = await saveGoogleCalendarConnection(
    { tenantId },
    { refreshToken: tokens.refreshToken, subject: claims.subject, email: claims.email, scope: tokens.scope },
    key,
    nowFn(),
  );
  // D8 (changed): el token de la otra cuenta se revoca después del commit (best effort).
  if (saved.previousRefreshToken) await revokeGoogleToken(saved.previousRefreshToken, http);
  return "connected";
}

/** Web (server action), D7 y D8: borra el token y lo revoca en Google (best effort). Conserva
 *  googleSubject, calendarId y connectedAt; no toca turnos ni googleEventId. */
export async function disconnectGoogleCalendar(t: TenantRef, deps?: GoogleOAuthHttpDeps): Promise<{ revoked: boolean }> {
  const { http, env, now: nowFn } = resolveDeps(deps);
  const key = tryLoadKey(env);
  const token = await prisma.$transaction(async (tx) => {
    const { scope: { tenantId }, agendaOwner } = await resolveTenantCalendarContext(tx, t.tenantId);
    const row = await lockRow(tx, tenantId);
    await clearLegacyPlaintext(tx, tenantId, agendaOwner.professionalId);
    if (!row?.refreshTokenEnc) return null;
    const plain = tryOpenRefreshToken(row.refreshTokenEnc, key, tenantId);
    await tx.googleCalendarAccount.update({
      where: { tenantId },
      data: {
        refreshTokenEnc: null,
        googleEmail: null,
        scope: null,
        syncError: null,
        syncErrorAt: null,
        disconnectedAt: nowFn(),
      },
    });
    return plain;
  }, TX_OPTIONS);
  if (!token) return { revoked: false };
  const revoked = await revokeGoogleToken(token, http);
  if (!revoked) console.warn("[google-calendar] revoke_failed");
  return { revoked };
}

/** Web (server action "Opciones avanzadas"). false si no hay calendario conectado (no escribe).
 *  Cambiar de calendario no mueve los eventos ya creados. */
export async function setGoogleCalendarId(t: TenantRef, calendarId: string | null): Promise<boolean> {
  const res = await prisma.googleCalendarAccount.updateMany({
    where: { tenantId: t.tenantId, refreshTokenEnc: { not: null } },
    data: { calendarId },
  });
  return res.count === 1;
}

/** Bot (cron): consultorios con calendario conectado, orden por tenantId. */
export async function listConnectedGoogleCalendarTenants(): Promise<TenantRef[]> {
  const rows = await prisma.googleCalendarAccount.findMany({
    where: { refreshTokenEnc: { not: null } },
    select: { tenantId: true },
    orderBy: { tenantId: "asc" },
  });
  return rows.map(({ tenantId }) => ({ tenantId }));
}
