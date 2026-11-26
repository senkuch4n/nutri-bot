// HU-028b: lógica pura del OAuth propio de Google Calendar (separado del login, PKCE S256).
// Este archivo se importa en componentes cliente (GOOGLE_CALENDAR_TEXT): nada de `node:*` ni red.
// Lo criptográfico y el HTTP viven en packages/db/domain (secretBox, googleOAuthClient).
import { canonicalEmail } from "./tenant-access";

export const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
/** Identidad mínima para mostrar la cuenta y aplicar D8 + el permiso de eventos. Nada más. */
export const GOOGLE_CALENDAR_OAUTH_SCOPES = ["openid", "email", GOOGLE_CALENDAR_EVENTS_SCOPE] as const;
export const GOOGLE_CALENDAR_CALLBACK_PATH = "/api/google-calendar/oauth/callback";
export const GOOGLE_CALENDAR_OAUTH_STATE_TTL_MINUTES = 10;

export type GoogleCalendarConnectionStatus = "not_configured" | "not_connected" | "connected";
export type GoogleCalendarCallbackResult =
  | "connected"
  | "denied"
  | "invalid_state"
  | "rejected"
  | "scope_denied"
  | "not_configured";
/** D8: first = nunca hubo conexión; same = misma cuenta (o anterior desconocida); changed = otra cuenta. */
export type GoogleCalendarConnectionKind = "first" | "same" | "changed";

const GOOGLE_ISSUERS: readonly string[] = ["accounts.google.com", "https://accounts.google.com"];

/** URL de autorización. Orden fijo (URLSearchParams): client_id, redirect_uri, response_type=code,
 *  scope (GOOGLE_CALENDAR_OAUTH_SCOPES unidos por espacio), access_type=offline, prompt=consent, state,
 *  code_challenge, code_challenge_method=S256. SIN include_granted_scopes (D15: la credencial del
 *  calendario no hereda los permisos del login). */
export function buildGoogleCalendarAuthorizationUrl(p: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams([
    ["client_id", p.clientId],
    ["redirect_uri", p.redirectUri],
    ["response_type", "code"],
    ["scope", GOOGLE_CALENDAR_OAUTH_SCOPES.join(" ")],
    ["access_type", "offline"],
    ["prompt", "consent"],
    ["state", p.state],
    ["code_challenge", p.codeChallenge],
    ["code_challenge_method", "S256"],
  ]);
  return `${GOOGLE_AUTHORIZATION_URL}?${params.toString()}`;
}

/** `${new URL(authUrl).origin}${GOOGLE_CALENDAR_CALLBACK_PATH}`; null si falta, es inválida o no es http(s). */
export function googleCalendarRedirectUri(authUrl: string | undefined | null): string | null {
  const raw = authUrl?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}${GOOGLE_CALENDAR_CALLBACK_PATH}`;
  } catch {
    return null;
  }
}

/** Query del callback. `error` presente o sin `code` → denied (state opcional); `code` sin `state` → invalid. */
export function parseGoogleCalendarCallback(
  q: URLSearchParams,
):
  | { kind: "ok"; code: string; state: string }
  | { kind: "denied"; state: string | null }
  | { kind: "invalid" } {
  const code = q.get("code")?.trim() || null;
  const state = q.get("state")?.trim() || null;
  const error = q.get("error")?.trim() || null;
  if (error || !code) return { kind: "denied", state };
  if (!state) return { kind: "invalid" };
  return { kind: "ok", code, state };
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Respuesta de POST /token (authorization_code). Exige refresh_token e id_token (strings no vacíos);
 *  scope = string o null. Cualquier otra forma → null. No guarda ni devuelve el access_token. */
export function parseGoogleTokenResponse(
  json: unknown,
): { refreshToken: string; idToken: string; scope: string | null } | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const body = json as Record<string, unknown>;
  const refreshToken = nonEmptyString(body.refresh_token);
  const idToken = nonEmptyString(body.id_token);
  if (!refreshToken || !idToken) return null;
  return { refreshToken, idToken, scope: nonEmptyString(body.scope) };
}

function decodeBase64UrlJson(segment: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return null;
  const b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

/** Claims del id_token recibido directo del endpoint de token por TLS (OIDC Core 3.1.3.7: no hace falta
 *  verificar la firma). Exige: 3 segmentos; payload JSON; iss ∈ {"accounts.google.com",
 *  "https://accounts.google.com"}; aud === clientId (o array que lo contiene, y entonces azp === clientId);
 *  si viene azp, azp === clientId; exp (segundos) * 1000 > now; sub string 1..255; email_verified === true;
 *  email string no vacío. Devuelve el email canónico (canonicalEmail). Cualquier falla → null. */
export function parseGoogleIdTokenClaims(
  idToken: string,
  opts: { clientId: string; now: Date },
): { subject: string; email: string } | null {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  const payload = decodeBase64UrlJson(parts[1]!);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const c = payload as Record<string, unknown>;

  if (typeof c.iss !== "string" || !GOOGLE_ISSUERS.includes(c.iss)) return null;
  if (Array.isArray(c.aud)) {
    if (!c.aud.includes(opts.clientId) || c.azp !== opts.clientId) return null;
  } else if (c.aud !== opts.clientId) {
    return null;
  }
  if (c.azp !== undefined && c.azp !== opts.clientId) return null;
  if (typeof c.exp !== "number" || !Number.isFinite(c.exp) || c.exp * 1000 <= opts.now.getTime()) return null;
  if (typeof c.sub !== "string" || c.sub.length < 1 || c.sub.length > 255) return null;
  if (c.email_verified !== true) return null;
  const email = nonEmptyString(c.email);
  if (!email) return null;
  return { subject: c.sub, email: canonicalEmail(email) };
}

/** true si el scope (separado por espacios) incluye GOOGLE_CALENDAR_EVENTS_SCOPE. null → false. */
export function hasGoogleCalendarEventsScope(scope: string | null): boolean {
  if (!scope) return false;
  return scope.split(/\s+/).includes(GOOGLE_CALENDAR_EVENTS_SCOPE);
}

/** D8. hadConnection = la fila tuvo connectedAt alguna vez.
 *  !hadConnection → "first"; previousSubject null (traslado sin identidad) → "same";
 *  previousSubject === nextSubject → "same"; distinto → "changed". */
export function decideGoogleCalendarConnection(p: {
  hadConnection: boolean;
  previousSubject: string | null;
  nextSubject: string;
}): GoogleCalendarConnectionKind {
  if (!p.hadConnection) return "first";
  if (p.previousSubject === null) return "same";
  return p.previousSubject === p.nextSubject ? "same" : "changed";
}

export const GOOGLE_CALENDAR_TEXT = {
  account: "Cuenta",
  callback: {
    connected: "Google Calendar conectado.",
    denied: "No se conectó el calendario: la autorización fue cancelada en Google.",
    invalid_state: "No pudimos verificar la conexión. Probá de nuevo.",
    rejected: "Google rechazó la conexión. Probá de nuevo; si se repite, avisá al soporte.",
    scope_denied: "Para sincronizar los turnos hace falta permitir el acceso a los eventos del calendario.",
    not_configured: "La conexión con Google Calendar no está configurada en el servidor.",
  },
} as const satisfies { account: string; callback: Record<GoogleCalendarCallbackResult, string> };
