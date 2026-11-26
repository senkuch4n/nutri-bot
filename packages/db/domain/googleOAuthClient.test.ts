import { randomBytes } from "node:crypto";
import { GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL } from "@nutri-bot/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GoogleOAuthApiError,
  exchangeGoogleAuthorizationCode,
  getGoogleCalendarAppConfig,
  revokeGoogleToken,
  type GoogleCalendarAppConfig,
} from "./googleOAuthClient";

const APP: GoogleCalendarAppConfig = {
  clientId: "client-123.apps.googleusercontent.com",
  clientSecret: "SECRETO-DE-LA-APP",
  redirectUri: "https://numa.arzium.com.ar/api/google-calendar/oauth/callback",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fetchReturning(status: number, body: unknown) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => jsonResponse(status, body));
}

afterEach(() => vi.restoreAllMocks());

describe("getGoogleCalendarAppConfig", () => {
  const env = {
    GOOGLE_CLIENT_ID: APP.clientId,
    GOOGLE_CLIENT_SECRET: APP.clientSecret,
    INTEGRATION_TOKEN_KEY: randomBytes(32).toString("base64"),
    AUTH_URL: "https://numa.arzium.com.ar/",
  };
  it("arma la redirect URI desde AUTH_URL", () => {
    expect(getGoogleCalendarAppConfig(env)).toEqual(APP);
  });
  it.each(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "INTEGRATION_TOKEN_KEY", "AUTH_URL"])("null si falta %s", (name) => {
    expect(getGoogleCalendarAppConfig({ ...env, [name]: undefined })).toBeNull();
  });
  it("null si la clave es inválida o si solo está la de Mercado Pago", () => {
    expect(getGoogleCalendarAppConfig({ ...env, INTEGRATION_TOKEN_KEY: "corta" })).toBeNull();
    expect(
      getGoogleCalendarAppConfig({ ...env, INTEGRATION_TOKEN_KEY: undefined, MERCADOPAGO_TOKEN_KEY: env.INTEGRATION_TOKEN_KEY }),
    ).toBeNull();
  });
});

describe("exchangeGoogleAuthorizationCode", () => {
  it("POST form-urlencoded con los 6 campos y code_verifier; devuelve el JSON crudo", async () => {
    const body = { access_token: "at", refresh_token: "rt", id_token: "it", scope: "openid" };
    const fetch = fetchReturning(200, body);
    const res = await exchangeGoogleAuthorizationCode(APP, { code: "CODE-1", codeVerifier: "VERIFIER-1" }, { fetch });
    expect(res).toEqual(body);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(GOOGLE_TOKEN_URL);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      code: "CODE-1",
      client_id: APP.clientId,
      client_secret: APP.clientSecret,
      redirect_uri: APP.redirectUri,
      grant_type: "authorization_code",
      code_verifier: "VERIFIER-1",
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("400 → GoogleOAuthApiError saneado (sin code, secret, verifier ni body)", async () => {
    const fetch = fetchReturning(400, { error: "invalid_grant", error_description: "SECRETO" });
    const error = await exchangeGoogleAuthorizationCode(APP, { code: "CODE-1", codeVerifier: "VERIFIER-1" }, { fetch }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(GoogleOAuthApiError);
    const e = error as GoogleOAuthApiError;
    expect(e.status).toBe(400);
    expect(e.code).toBe("invalid_grant");
    expect(e.name).toBe("GoogleOAuthApiError");
    for (const secret of ["CODE-1", "VERIFIER-1", APP.clientSecret, "SECRETO"]) {
      expect(e.message).not.toContain(secret);
      expect(JSON.stringify(e)).not.toContain(secret);
    }
  });

  it("código de error que no es identificador → code null", async () => {
    const fetch = fetchReturning(400, { error: "tiene espacios y SECRETO" });
    const e = (await exchangeGoogleAuthorizationCode(APP, { code: "c", codeVerifier: "v" }, { fetch }).catch(
      (x: unknown) => x,
    )) as GoogleOAuthApiError;
    expect(e.code).toBeNull();
    expect(e.message).not.toContain("SECRETO");
  });

  it("falla de red → status 0", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("ECONNRESET con CODE-1");
    });
    const e = (await exchangeGoogleAuthorizationCode(APP, { code: "CODE-1", codeVerifier: "v" }, { fetch }).catch(
      (x: unknown) => x,
    )) as GoogleOAuthApiError;
    expect(e).toBeInstanceOf(GoogleOAuthApiError);
    expect(e.status).toBe(0);
    expect(e.message).not.toContain("CODE-1");
  });
});

describe("revokeGoogleToken (D7, best effort)", () => {
  it("200 → true, con el token en el body form-urlencoded", async () => {
    const fetch = fetchReturning(200, {});
    expect(await revokeGoogleToken("RT-1", { fetch })).toBe(true);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(GOOGLE_REVOKE_URL);
    expect(String(url)).not.toContain("RT-1");
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({ token: "RT-1" });
  });

  it("400 → false", async () => {
    expect(await revokeGoogleToken("RT-1", { fetch: fetchReturning(400, { error: "invalid_token" }) })).toBe(false);
  });

  it("excepción → false, nunca tira ni loguea", async () => {
    const spies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const fetch = vi.fn(async () => {
      throw new Error("red caída");
    });
    await expect(revokeGoogleToken("RT-1", { fetch })).resolves.toBe(false);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
