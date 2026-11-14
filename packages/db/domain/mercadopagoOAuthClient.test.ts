import { randomBytes } from "node:crypto";
import { MERCADOPAGO_TOKEN_URL, MERCADOPAGO_USERS_ME_URL } from "@nutri-bot/core";
import { describe, expect, it, vi } from "vitest";
import {
  MercadoPagoApiError,
  exchangeMercadoPagoCode,
  fetchMercadoPagoUser,
  getMercadoPagoAppConfig,
  refreshMercadoPagoToken,
  type MercadoPagoAppConfig,
} from "./mercadopagoOAuthClient";

const NOW = new Date("2026-11-12T12:00:00.000Z");
const APP: MercadoPagoAppConfig = {
  clientId: "1234",
  clientSecret: "SECRETO-DE-LA-APP",
  redirectUri: "https://x.sslip.io/api/mercadopago/oauth/callback",
};
const TOKEN_RESPONSE = {
  access_token: "APP_USR-access-nuevo",
  token_type: "bearer",
  expires_in: 15552000,
  scope: "offline_access payments read write",
  user_id: 555,
  refresh_token: "TG-refresh-nuevo",
  public_key: "APP_USR-pk",
  live_mode: true,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fetchReturning(status: number, body: unknown) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => jsonResponse(status, body));
}

describe("getMercadoPagoAppConfig", () => {
  const env = {
    MERCADOPAGO_CLIENT_ID: "1234",
    MERCADOPAGO_CLIENT_SECRET: "s",
    MERCADOPAGO_TOKEN_KEY: randomBytes(32).toString("base64"),
    AUTH_URL: "https://x.sslip.io/",
  };
  it("arma la redirect URI desde AUTH_URL", () => {
    expect(getMercadoPagoAppConfig(env)).toEqual({ clientId: "1234", clientSecret: "s", redirectUri: APP.redirectUri });
  });
  it.each(["MERCADOPAGO_CLIENT_ID", "MERCADOPAGO_CLIENT_SECRET", "MERCADOPAGO_TOKEN_KEY", "AUTH_URL"])(
    "null si falta %s",
    (name) => {
      expect(getMercadoPagoAppConfig({ ...env, [name]: undefined })).toBeNull();
    },
  );
  it("null si la clave de cifrado es inválida", () => {
    expect(getMercadoPagoAppConfig({ ...env, MERCADOPAGO_TOKEN_KEY: "corta" })).toBeNull();
  });
});

describe("exchangeMercadoPagoCode", () => {
  it("POST a /oauth/token con el JSON exacto de PKCE", async () => {
    const fetch = fetchReturning(200, TOKEN_RESPONSE);
    const tokens = await exchangeMercadoPagoCode(
      { code: "TG-code", codeVerifier: "verifier-123", app: APP },
      { fetch, now: () => NOW },
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(MERCADOPAGO_TOKEN_URL);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json", Accept: "application/json" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toEqual({
      client_id: "1234",
      client_secret: "SECRETO-DE-LA-APP",
      code: "TG-code",
      grant_type: "authorization_code",
      redirect_uri: APP.redirectUri,
      code_verifier: "verifier-123",
    });
    expect(tokens).toEqual({
      accessToken: "APP_USR-access-nuevo",
      refreshToken: "TG-refresh-nuevo",
      userId: "555",
      liveMode: true,
      scope: "offline_access payments read write",
      expiresAt: new Date(NOW.getTime() + 15552000 * 1000),
    });
  });

  it("400 invalid_grant → MercadoPagoApiError revoked, sin datos sensibles en el error", async () => {
    const fetch = fetchReturning(400, {
      error: "invalid_grant",
      message: "TG-code verifier-123 SECRETO-DE-LA-APP",
    });
    const error = await exchangeMercadoPagoCode({ code: "TG-code", codeVerifier: "verifier-123", app: APP }, { fetch }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(MercadoPagoApiError);
    expect(error).toMatchObject({ status: 400, code: "invalid_grant", kind: "revoked" });
    const serialized = `${(error as Error).message} ${JSON.stringify(error)} ${String(error)}`;
    for (const secret of ["SECRETO-DE-LA-APP", "TG-code", "verifier-123", "client_secret"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("fetch que rechaza → status 0, transient", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("network down");
    });
    await expect(
      exchangeMercadoPagoCode({ code: "c", codeVerifier: "v", app: APP }, { fetch: fetch as unknown as typeof globalThis.fetch }),
    ).rejects.toMatchObject({ status: 0, kind: "transient" });
  });

  it("200 sin refresh_token → rejected", async () => {
    const { refresh_token: _r, ...partial } = TOKEN_RESPONSE;
    await expect(
      exchangeMercadoPagoCode({ code: "c", codeVerifier: "v", app: APP }, { fetch: fetchReturning(200, partial) }),
    ).rejects.toMatchObject({ code: "invalid_token_response", kind: "rejected" });
  });

  it("200 sin user_id → rejected", async () => {
    const { user_id: _u, ...partial } = TOKEN_RESPONSE;
    await expect(
      exchangeMercadoPagoCode({ code: "c", codeVerifier: "v", app: APP }, { fetch: fetchReturning(200, partial) }),
    ).rejects.toMatchObject({ kind: "rejected" });
  });

  it("503 → transient", async () => {
    await expect(
      exchangeMercadoPagoCode({ code: "c", codeVerifier: "v", app: APP }, { fetch: fetchReturning(503, {}) }),
    ).rejects.toMatchObject({ status: 503, kind: "transient" });
  });
});

describe("refreshMercadoPagoToken", () => {
  it("POST con el JSON exacto de refresh (4 claves)", async () => {
    const fetch = fetchReturning(200, TOKEN_RESPONSE);
    const tokens = await refreshMercadoPagoToken({ refreshToken: "TG-viejo", app: APP }, { fetch, now: () => NOW });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(MERCADOPAGO_TOKEN_URL);
    expect(JSON.parse(String(init?.body))).toEqual({
      client_id: "1234",
      client_secret: "SECRETO-DE-LA-APP",
      grant_type: "refresh_token",
      refresh_token: "TG-viejo",
    });
    expect(tokens.refreshToken).toBe("TG-refresh-nuevo");
  });

  it("401 → revoked", async () => {
    await expect(
      refreshMercadoPagoToken({ refreshToken: "TG-viejo", app: APP }, { fetch: fetchReturning(401, {}) }),
    ).rejects.toMatchObject({ status: 401, kind: "revoked" });
  });
});

describe("fetchMercadoPagoUser", () => {
  it("manda Bearer y mapea id a string", async () => {
    const fetch = fetchReturning(200, { id: 555, nickname: "TESTUSER", email: "vendedor@test.com" });
    expect(await fetchMercadoPagoUser("APP_USR-x", { fetch })).toEqual({
      id: "555",
      nickname: "TESTUSER",
      email: "vendedor@test.com",
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(MERCADOPAGO_USERS_ME_URL);
    expect(init?.headers).toMatchObject({ Authorization: "Bearer APP_USR-x" });
  });

  it("sin nickname ni email → null", async () => {
    expect(await fetchMercadoPagoUser("t", { fetch: fetchReturning(200, { id: "9" }) })).toEqual({
      id: "9",
      nickname: null,
      email: null,
    });
  });
});
