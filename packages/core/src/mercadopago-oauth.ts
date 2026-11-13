// HU-023: lógica pura de la conexión con Mercado Pago por OAuth (aplicación "Numa", PKCE S256).
// Este archivo se importa en componentes cliente (MERCADOPAGO_TEXT): nada de `node:*` ni red.
// Lo criptográfico y el HTTP viven en packages/db/domain (secretBox, mercadopagoOAuthClient).

export const MERCADOPAGO_AUTHORIZATION_URL = "https://auth.mercadopago.com/authorization";
export const MERCADOPAGO_TOKEN_URL = "https://api.mercadopago.com/oauth/token";
export const MERCADOPAGO_USERS_ME_URL = "https://api.mercadopago.com/users/me";
export const MERCADOPAGO_CALLBACK_PATH = "/api/mercadopago/oauth/callback";
export const MERCADOPAGO_REFRESH_THRESHOLD_DAYS = 30; // D4
export const MERCADOPAGO_OAUTH_STATE_TTL_MINUTES = 10; // = vida del code
export const MERCADOPAGO_ALERT_THROTTLE_HOURS = 24; // D5
/** D6: motivo de cancelación de las señas pendientes al cambiar/desconectar la cuenta. */
export const MERCADOPAGO_ACCOUNT_CHANGED_CANCEL_REASON = "Se desconectó o cambió la cuenta de Mercado Pago";

export type MercadoPagoErrorCode = "revoked" | "refresh_failed" | "decrypt_failed";
export type MercadoPagoConnectionStatus = "not_configured" | "not_connected" | "connected" | "needs_reconnect";
export type MercadoPagoCallbackResult =
  | "connected"
  | "denied"
  | "invalid_state"
  | "rejected"
  | "not_configured"
  | "wrong_environment";
export type MercadoPagoFailureKind = "revoked" | "transient" | "rejected";

export type MercadoPagoTokenSet = {
  accessToken: string;
  refreshToken: string;
  /** String(user_id). null si MP no lo devolvió (en el refresh se conserva el guardado). */
  userId: string | null;
  liveMode: boolean | null;
  scope: string | null;
  expiresAt: Date;
};

const DAY_MS = 24 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;

/** URL de autorización. Orden fijo de params: client_id, response_type=code, platform_id=mp,
 *  state, redirect_uri, code_challenge, code_challenge_method=S256 (URLSearchParams). */
export function buildMercadoPagoAuthorizationUrl(p: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams([
    ["client_id", p.clientId],
    ["response_type", "code"],
    ["platform_id", "mp"],
    ["state", p.state],
    ["redirect_uri", p.redirectUri],
    ["code_challenge", p.codeChallenge],
    ["code_challenge_method", "S256"],
  ]);
  return `${MERCADOPAGO_AUTHORIZATION_URL}?${params.toString()}`;
}

/** `${new URL(authUrl).origin}${MERCADOPAGO_CALLBACK_PATH}`. null si authUrl falta o es inválida. */
export function mercadoPagoRedirectUri(authUrl: string | undefined | null): string | null {
  const raw = authUrl?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}${MERCADOPAGO_CALLBACK_PATH}`;
  } catch {
    return null;
  }
}

/** Clasifica el query del callback. Sin `code` → "denied" (con o sin `error`), state opcional.
 *  Con `code` pero sin `state` → "invalid". */
export function parseMercadoPagoCallback(
  q: URLSearchParams,
):
  | { kind: "ok"; code: string; state: string }
  | { kind: "denied"; state: string | null }
  | { kind: "invalid" } {
  const code = q.get("code")?.trim() || null;
  const state = q.get("state")?.trim() || null;
  if (!code) return { kind: "denied", state };
  if (!state) return { kind: "invalid" };
  return { kind: "ok", code, state };
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Valida la respuesta de POST /oauth/token (create o refresh). Exige access_token,
 *  refresh_token (string no vacío) y expires_in (número > 0); si falta alguno → null.
 *  user_id numérico → String(user_id). expiresAt = now + expires_in segundos. */
export function parseMercadoPagoTokenResponse(json: unknown, now: Date): MercadoPagoTokenSet | null {
  if (!json || typeof json !== "object") return null;
  const body = json as Record<string, unknown>;
  const accessToken = nonEmptyString(body.access_token);
  const refreshToken = nonEmptyString(body.refresh_token);
  const expiresIn = body.expires_in;
  if (!accessToken || !refreshToken) return null;
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) return null;
  const rawUserId = body.user_id;
  const userId =
    typeof rawUserId === "number" && Number.isFinite(rawUserId)
      ? String(rawUserId)
      : nonEmptyString(rawUserId);
  return {
    accessToken,
    refreshToken,
    userId,
    liveMode: typeof body.live_mode === "boolean" ? body.live_mode : null,
    scope: nonEmptyString(body.scope),
    expiresAt: new Date(now.getTime() + expiresIn * 1000),
  };
}

/** true si expiresAt - now < thresholdDays (default 30). */
export function needsMercadoPagoRefresh(
  expiresAt: Date,
  now: Date,
  thresholdDays: number = MERCADOPAGO_REFRESH_THRESHOLD_DAYS,
): boolean {
  return expiresAt.getTime() - now.getTime() < thresholdDays * DAY_MS;
}

/** true si expiresAt - now <= skewMs (default 60_000). */
export function isMercadoPagoTokenExpired(expiresAt: Date, now: Date, skewMs = 60_000): boolean {
  return expiresAt.getTime() - now.getTime() <= skewMs;
}

/** status 401 → "revoked"; error/código "invalid_grant" o "invalid_token" → "revoked";
 *  status 0 / undefined (red), 408, 429, >= 500 → "transient"; el resto (400, 403, 404,
 *  "invalid_client"...) → "rejected". */
export function classifyMercadoPagoFailure(input: { status?: number; code?: string | null }): MercadoPagoFailureKind {
  const { status, code } = input;
  if (status === 401) return "revoked";
  if (code === "invalid_grant" || code === "invalid_token") return "revoked";
  if (status === undefined || status === 0 || status === 408 || status === 429 || status >= 500) return "transient";
  return "rejected";
}

export function mercadoPagoConnectionStatus(input: {
  configured: boolean;
  hasAccount: boolean;
  errorCode: string | null;
}): MercadoPagoConnectionStatus {
  if (!input.configured) return "not_configured";
  if (!input.hasAccount) return "not_connected";
  if (input.errorCode) return "needs_reconnect";
  return "connected";
}

/** Aviso transversal (Servicios / Ajustes): hay servicios con seña activos y la cuenta no está "connected". */
export function shouldWarnDepositWithoutMercadoPago(input: {
  hasActiveDepositServices: boolean;
  status: MercadoPagoConnectionStatus;
}): boolean {
  return input.hasActiveDepositServices && input.status !== "connected";
}

/** null → true; now - last >= hours → true. */
export function shouldSendThrottledAlert(
  lastSentAt: Date | null,
  now: Date,
  hours: number = MERCADOPAGO_ALERT_THROTTLE_HOURS,
): boolean {
  if (!lastSentAt) return true;
  return now.getTime() - lastSentAt.getTime() >= hours * HOUR_MS;
}

/** D3: respaldo de desarrollo. true solo si MERCADOPAGO_ALLOW_ENV_TOKEN === "true",
 *  NODE_ENV !== "production" y MERCADOPAGO_ACCESS_TOKEN no vacío. */
export function allowsMercadoPagoEnvToken(env: Record<string, string | undefined>): boolean {
  return (
    env.MERCADOPAGO_ALLOW_ENV_TOKEN?.trim() === "true" &&
    env.NODE_ENV !== "production" &&
    Boolean(env.MERCADOPAGO_ACCESS_TOKEN?.trim())
  );
}

/** D8: en producción (NODE_ENV === "production") solo se aceptan cuentas con live_mode === true. */
export function requiresLiveMercadoPagoAccount(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV === "production";
}

/** Textos del panel (Ajustes → Mercado Pago y avisos). Sin jerga técnica (regla de SETTINGS_TEXT). */
export const MERCADOPAGO_TEXT = {
  account: "Cuenta",
  notConnected: "No conectada",
  connected: "Conectada",
  needsReconnect: "Hay que reconectar",
  notConfigured: "No disponible",
  help: "Conectá tu cuenta de Mercado Pago para que las señas que pagan tus pacientes se acrediten directamente en tu cuenta. Vas a iniciar sesión en Mercado Pago; NutriBot nunca ve tu contraseña.",
  connect: "Conectar Mercado Pago",
  reconnect: "Reconectar",
  disconnect: "Desconectar",
  user: "Usuario",
  userId: "N.º de usuario de Mercado Pago",
  connectedAt: "Conectada el",
  testAccount: "Cuenta de prueba",
  disconnectTitle: "¿Desconectar Mercado Pago?",
  disconnectDescription: "Los pacientes no van a poder pagar señas hasta que vuelvas a conectar.",
  disconnectPending: (n: number) =>
    n === 1
      ? "Hay 1 seña esperando pago: si desconectás, se cancela ese turno y le avisamos al paciente."
      : `Hay ${n} señas esperando pago: si desconectás, se cancelan esos turnos y les avisamos a los pacientes.`,
  errorAlert: (reason: string) =>
    `Mercado Pago se desconectó: ${reason}. Hasta que reconectes, los pacientes no pueden pagar señas.`,
  errorReasons: {
    revoked: "se quitó el permiso desde Mercado Pago o dejó de ser válido",
    refresh_failed: "no se pudo renovar el permiso",
    decrypt_failed: "cambió la clave de seguridad del servidor",
  },
  callback: {
    connected: "Cuenta de Mercado Pago conectada.",
    denied: "No se conectó la cuenta: la autorización fue cancelada en Mercado Pago.",
    invalid_state: "No pudimos verificar la conexión. Probá de nuevo.",
    rejected: "Mercado Pago rechazó la conexión. Probá de nuevo; si se repite, avisá al soporte.",
    not_configured: "La conexión con Mercado Pago no está configurada en el servidor.",
    wrong_environment:
      "Esa es una cuenta de prueba de Mercado Pago. Para cobrar señas de verdad, conectá tu cuenta real.",
  },
  depositWarningTitle: "Tenés servicios con seña pero Mercado Pago no está conectado",
  depositWarningBody: "Hasta que lo conectes, los pacientes no pueden reservar esos servicios por WhatsApp.",
  depositWarningAction: "Ir a Ajustes → Mercado Pago",
  serviceFormNote: "Para cobrar la seña, conectá Mercado Pago en Ajustes.",
  serviceFormNoteAction: "Conectar Mercado Pago",
} as const;
