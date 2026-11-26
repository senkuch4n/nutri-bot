// HU-028b: cliente HTTP mínimo del OAuth propio de Google Calendar (canje con PKCE y revocación).
// Server-only. `fetch` directo e inyectable (los tests no tocan la red). Los errores salen saneados:
// nunca llevan el body crudo, tokens, code, verifier ni client_secret.
import { GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL, googleCalendarRedirectUri } from "@nutri-bot/core";
import { loadIntegrationTokenKey } from "./secretBox";

export type GoogleOAuthHttpDeps = {
  fetch?: typeof fetch; // default globalThis.fetch
  env?: Record<string, string | undefined>; // default process.env
  now?: () => Date; // default () => new Date()
};

export type GoogleCalendarAppConfig = { clientId: string; clientSecret: string; redirectUri: string };

export class GoogleCalendarConfigError extends Error {
  constructor(message = "La conexión con Google Calendar no está configurada") {
    super(message);
    this.name = "GoogleCalendarConfigError";
  }
}

const TIMEOUT_MS = 10_000;

/** null si falta GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_URL (redirect = googleCalendarRedirectUri)
 *  o INTEGRATION_TOKEN_KEY es inválida. */
export function getGoogleCalendarAppConfig(
  env: Record<string, string | undefined> = process.env,
): GoogleCalendarAppConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = googleCalendarRedirectUri(env.AUTH_URL);
  if (!clientId || !clientSecret || !redirectUri) return null;
  try {
    loadIntegrationTokenKey(env);
  } catch {
    return null;
  }
  return { clientId, clientSecret, redirectUri };
}

/** Error saneado: status (0 = red/timeout) y un código con forma de identificador (body.error de Google,
 *  /^[a-z0-9_.-]{1,64}$/i). Nunca el body, code, verifier, tokens ni secret. */
export class GoogleOAuthApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null) {
    super(`Google respondió con error (status ${status}${code ? `, ${code}` : ""})`);
    this.name = "GoogleOAuthApiError";
    this.status = status;
    this.code = code;
  }
}

function safeErrorCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { error?: unknown }).error;
  return typeof raw === "string" && /^[a-z0-9_.-]{1,64}$/i.test(raw) ? raw : null;
}

function formPost(body: Record<string, string>, deps: GoogleOAuthHttpDeps, url: string): Promise<Response> {
  const doFetch = deps.fetch ?? globalThis.fetch;
  return doFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** POST GOOGLE_TOKEN_URL, x-www-form-urlencoded: code, client_id, client_secret, redirect_uri,
 *  grant_type=authorization_code, code_verifier. Timeout 10 s. !ok o red → GoogleOAuthApiError.
 *  Devuelve el JSON crudo (lo valida parseGoogleTokenResponse). */
export async function exchangeGoogleAuthorizationCode(
  app: GoogleCalendarAppConfig,
  input: { code: string; codeVerifier: string },
  deps: GoogleOAuthHttpDeps = {},
): Promise<unknown> {
  let res: Response;
  try {
    res = await formPost(
      {
        code: input.code,
        client_id: app.clientId,
        client_secret: app.clientSecret,
        redirect_uri: app.redirectUri,
        grant_type: "authorization_code",
        code_verifier: input.codeVerifier,
      },
      deps,
      GOOGLE_TOKEN_URL,
    );
  } catch {
    throw new GoogleOAuthApiError(0, null);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) throw new GoogleOAuthApiError(res.status, safeErrorCode(body));
  return body;
}

/** POST GOOGLE_REVOKE_URL (token=... en el body, x-www-form-urlencoded). Best effort (D7): true si 200,
 *  false ante cualquier otra cosa. NUNCA tira ni loguea el token. */
export async function revokeGoogleToken(token: string, deps: GoogleOAuthHttpDeps = {}): Promise<boolean> {
  try {
    const res = await formPost({ token }, deps, GOOGLE_REVOKE_URL);
    return res.status === 200;
  } catch {
    return false;
  }
}
