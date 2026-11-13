// HU-023: cliente HTTP mínimo del OAuth de Mercado Pago (canje con PKCE, renovación, /users/me).
// Usa `fetch` directo e inyectable (el SDK 3.6.1 no tipa `code_verifier`; así los tests no tocan la
// red). Los errores salen saneados: nunca llevan el body crudo, tokens, code, verifier ni secret.
import {
  MERCADOPAGO_TOKEN_URL,
  MERCADOPAGO_USERS_ME_URL,
  classifyMercadoPagoFailure,
  mercadoPagoRedirectUri,
  parseMercadoPagoTokenResponse,
  type MercadoPagoFailureKind,
  type MercadoPagoTokenSet,
} from "@nutri-bot/core";
import { loadMercadoPagoTokenKey } from "./secretBox";

export type MercadoPagoHttpDeps = {
  fetch?: typeof fetch; // default: globalThis.fetch
  env?: Record<string, string | undefined>; // default: process.env
  now?: () => Date; // default: () => new Date()
};

export type MercadoPagoAppConfig = { clientId: string; clientSecret: string; redirectUri: string };

const TIMEOUT_MS = 10_000;

/** null si falta MERCADOPAGO_CLIENT_ID, MERCADOPAGO_CLIENT_SECRET, MERCADOPAGO_TOKEN_KEY (o es
 *  inválida) o AUTH_URL. redirectUri = mercadoPagoRedirectUri(AUTH_URL). */
export function getMercadoPagoAppConfig(
  env: Record<string, string | undefined> = process.env,
): MercadoPagoAppConfig | null {
  const clientId = env.MERCADOPAGO_CLIENT_ID?.trim();
  const clientSecret = env.MERCADOPAGO_CLIENT_SECRET?.trim();
  const redirectUri = mercadoPagoRedirectUri(env.AUTH_URL);
  if (!clientId || !clientSecret || !redirectUri) return null;
  try {
    loadMercadoPagoTokenKey(env);
  } catch {
    return null;
  }
  return { clientId, clientSecret, redirectUri };
}

/** Error saneado: nunca incluye el body crudo, tokens, code, code_verifier ni client_secret. */
export class MercadoPagoApiError extends Error {
  readonly status: number; // 0 = red / timeout
  readonly code: string | null; // body.error de MP (p. ej. "invalid_grant") si vino
  readonly kind: MercadoPagoFailureKind;

  constructor(status: number, code: string | null, kind?: MercadoPagoFailureKind) {
    super(`Mercado Pago respondió con error (status ${status}${code ? `, ${code}` : ""})`);
    this.name = "MercadoPagoApiError";
    this.status = status;
    this.code = code;
    this.kind = kind ?? classifyMercadoPagoFailure({ status, code });
  }
}

/** Solo acepta códigos de error con forma de identificador (p. ej. "invalid_grant"): nada que pueda
 *  arrastrar un dato sensible desde el body. */
function safeErrorCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { error?: unknown }).error;
  return typeof raw === "string" && /^[a-z0-9_.-]{1,64}$/i.test(raw) ? raw : null;
}

async function requestJson(
  url: string,
  init: RequestInit,
  deps: MercadoPagoHttpDeps,
): Promise<unknown> {
  const doFetch = deps.fetch ?? globalThis.fetch;
  let res: Response;
  try {
    res = await doFetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new MercadoPagoApiError(0, null, "transient");
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) throw new MercadoPagoApiError(res.status, safeErrorCode(body));
  return body;
}

async function postToken(body: Record<string, string>, deps: MercadoPagoHttpDeps): Promise<MercadoPagoTokenSet> {
  const now = (deps.now ?? (() => new Date()))();
  const json = await requestJson(
    MERCADOPAGO_TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    },
    deps,
  );
  const tokens = parseMercadoPagoTokenResponse(json, now);
  if (!tokens) throw new MercadoPagoApiError(200, "invalid_token_response", "rejected");
  return tokens;
}

/** Canje del authorization code (PKCE). Respuesta sin user_id → rejected. */
export async function exchangeMercadoPagoCode(
  p: { code: string; codeVerifier: string; app: MercadoPagoAppConfig },
  deps: MercadoPagoHttpDeps = {},
): Promise<MercadoPagoTokenSet> {
  const tokens = await postToken(
    {
      client_id: p.app.clientId,
      client_secret: p.app.clientSecret,
      code: p.code,
      grant_type: "authorization_code",
      redirect_uri: p.app.redirectUri,
      code_verifier: p.codeVerifier,
    },
    deps,
  );
  if (!tokens.userId) throw new MercadoPagoApiError(200, "invalid_token_response", "rejected");
  return tokens;
}

/** Renovación: cada refresh devuelve un refresh_token nuevo (el viejo deja de servir). */
export function refreshMercadoPagoToken(
  p: { refreshToken: string; app: MercadoPagoAppConfig },
  deps: MercadoPagoHttpDeps = {},
): Promise<MercadoPagoTokenSet> {
  return postToken(
    {
      client_id: p.app.clientId,
      client_secret: p.app.clientSecret,
      grant_type: "refresh_token",
      refresh_token: p.refreshToken,
    },
    deps,
  );
}

/** GET /users/me con el access token de la cuenta. */
export async function fetchMercadoPagoUser(
  accessToken: string,
  deps: MercadoPagoHttpDeps = {},
): Promise<{ id: string; nickname: string | null; email: string | null }> {
  const json = await requestJson(
    MERCADOPAGO_USERS_ME_URL,
    { method: "GET", headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
    deps,
  );
  const body = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  if (body.id == null) throw new MercadoPagoApiError(200, "invalid_user_response", "rejected");
  return {
    id: String(body.id),
    nickname: typeof body.nickname === "string" && body.nickname ? body.nickname : null,
    email: typeof body.email === "string" && body.email ? body.email : null,
  };
}
