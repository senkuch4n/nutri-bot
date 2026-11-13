import { describe, expect, it } from "vitest";
import {
  MERCADOPAGO_TEXT,
  allowsMercadoPagoEnvToken,
  buildMercadoPagoAuthorizationUrl,
  classifyMercadoPagoFailure,
  isMercadoPagoTokenExpired,
  mercadoPagoConnectionStatus,
  mercadoPagoRedirectUri,
  needsMercadoPagoRefresh,
  parseMercadoPagoCallback,
  parseMercadoPagoTokenResponse,
  requiresLiveMercadoPagoAccount,
  shouldSendThrottledAlert,
  shouldWarnDepositWithoutMercadoPago,
  type MercadoPagoCallbackResult,
} from "./mercadopago-oauth";

const NOW = new Date("2026-11-12T12:00:00.000Z");
const DAY = 24 * 60 * 60_000;

describe("buildMercadoPagoAuthorizationUrl", () => {
  it("arma la URL de auth.mercadopago.com con los params en orden y la redirect codificada", () => {
    const url = buildMercadoPagoAuthorizationUrl({
      clientId: "123",
      redirectUri: "https://x.sslip.io/api/mercadopago/oauth/callback",
      state: "st-1",
      codeChallenge: "chal_lenge-",
    });
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe("https://auth.mercadopago.com/authorization");
    expect([...parsed.searchParams.keys()]).toEqual([
      "client_id",
      "response_type",
      "platform_id",
      "state",
      "redirect_uri",
      "code_challenge",
      "code_challenge_method",
    ]);
    expect(parsed.searchParams.get("client_id")).toBe("123");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("platform_id")).toBe("mp");
    expect(parsed.searchParams.get("state")).toBe("st-1");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://x.sslip.io/api/mercadopago/oauth/callback");
    expect(url).toContain("redirect_uri=https%3A%2F%2Fx.sslip.io%2Fapi%2Fmercadopago%2Foauth%2Fcallback");
    expect(parsed.searchParams.get("code_challenge")).toBe("chal_lenge-");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("mercadoPagoRedirectUri", () => {
  it("usa solo el origen de AUTH_URL", () => {
    const expected = "https://x.sslip.io/api/mercadopago/oauth/callback";
    expect(mercadoPagoRedirectUri("https://x.sslip.io")).toBe(expected);
    expect(mercadoPagoRedirectUri("https://x.sslip.io/")).toBe(expected);
    expect(mercadoPagoRedirectUri("https://x.sslip.io/algo")).toBe(expected);
  });

  it("null si falta o no es una URL", () => {
    expect(mercadoPagoRedirectUri(undefined)).toBeNull();
    expect(mercadoPagoRedirectUri(null)).toBeNull();
    expect(mercadoPagoRedirectUri("")).toBeNull();
    expect(mercadoPagoRedirectUri("no-url")).toBeNull();
  });
});

describe("parseMercadoPagoCallback", () => {
  it("code + state → ok", () => {
    expect(parseMercadoPagoCallback(new URLSearchParams("code=TG-1&state=s"))).toEqual({
      kind: "ok",
      code: "TG-1",
      state: "s",
    });
  });
  it("error=access_denied con state → denied con state", () => {
    expect(parseMercadoPagoCallback(new URLSearchParams("error=access_denied&state=s"))).toEqual({
      kind: "denied",
      state: "s",
    });
  });
  it("query vacío → denied sin state", () => {
    expect(parseMercadoPagoCallback(new URLSearchParams(""))).toEqual({ kind: "denied", state: null });
  });
  it("code sin state → invalid", () => {
    expect(parseMercadoPagoCallback(new URLSearchParams("code=TG-1"))).toEqual({ kind: "invalid" });
  });
});

describe("parseMercadoPagoTokenResponse", () => {
  const full = {
    access_token: "APP_USR-a",
    token_type: "bearer",
    expires_in: 15552000,
    scope: "offline_access payments read write",
    user_id: 987654,
    refresh_token: "TG-r",
    public_key: "APP_USR-pk",
    live_mode: true,
  };

  it("respuesta completa", () => {
    expect(parseMercadoPagoTokenResponse(full, NOW)).toEqual({
      accessToken: "APP_USR-a",
      refreshToken: "TG-r",
      userId: "987654",
      liveMode: true,
      scope: "offline_access payments read write",
      expiresAt: new Date(NOW.getTime() + 15552000 * 1000),
    });
  });

  it("live_mode false se conserva", () => {
    expect(parseMercadoPagoTokenResponse({ ...full, live_mode: false }, NOW)?.liveMode).toBe(false);
  });

  it("sin refresh_token / sin expires_in / sin access_token → null", () => {
    const { refresh_token: _r, ...noRefresh } = full;
    const { expires_in: _e, ...noExpires } = full;
    const { access_token: _a, ...noAccess } = full;
    expect(parseMercadoPagoTokenResponse(noRefresh, NOW)).toBeNull();
    expect(parseMercadoPagoTokenResponse(noExpires, NOW)).toBeNull();
    expect(parseMercadoPagoTokenResponse(noAccess, NOW)).toBeNull();
    expect(parseMercadoPagoTokenResponse({ ...full, expires_in: 0 }, NOW)).toBeNull();
    expect(parseMercadoPagoTokenResponse({ ...full, refresh_token: "" }, NOW)).toBeNull();
  });

  it("null o string → null", () => {
    expect(parseMercadoPagoTokenResponse(null, NOW)).toBeNull();
    expect(parseMercadoPagoTokenResponse("hola", NOW)).toBeNull();
  });

  it("sin user_id → userId null", () => {
    const { user_id: _u, ...noUser } = full;
    expect(parseMercadoPagoTokenResponse(noUser, NOW)?.userId).toBeNull();
  });
});

describe("vencimientos", () => {
  it("needsMercadoPagoRefresh con umbral de 30 días", () => {
    expect(needsMercadoPagoRefresh(new Date(NOW.getTime() + 31 * DAY), NOW)).toBe(false);
    expect(needsMercadoPagoRefresh(new Date(NOW.getTime() + 29 * DAY), NOW)).toBe(true);
    expect(needsMercadoPagoRefresh(new Date(NOW.getTime() - DAY), NOW)).toBe(true);
  });

  it("isMercadoPagoTokenExpired con 60 s de margen", () => {
    expect(isMercadoPagoTokenExpired(new Date(NOW.getTime() + 2 * 60_000), NOW)).toBe(false);
    expect(isMercadoPagoTokenExpired(new Date(NOW.getTime() + 30_000), NOW)).toBe(true);
    expect(isMercadoPagoTokenExpired(new Date(NOW.getTime() - 1), NOW)).toBe(true);
  });
});

describe("classifyMercadoPagoFailure", () => {
  it("revocado", () => {
    expect(classifyMercadoPagoFailure({ status: 401 })).toBe("revoked");
    expect(classifyMercadoPagoFailure({ status: 400, code: "invalid_grant" })).toBe("revoked");
    expect(classifyMercadoPagoFailure({ status: 400, code: "invalid_token" })).toBe("revoked");
  });
  it("rechazado", () => {
    expect(classifyMercadoPagoFailure({ status: 400, code: "invalid_client" })).toBe("rejected");
    expect(classifyMercadoPagoFailure({ status: 403 })).toBe("rejected");
    expect(classifyMercadoPagoFailure({ status: 404 })).toBe("rejected");
  });
  it("transitorio", () => {
    for (const status of [0, 408, 429, 500, 503]) {
      expect(classifyMercadoPagoFailure({ status })).toBe("transient");
    }
    expect(classifyMercadoPagoFailure({})).toBe("transient");
  });
});

describe("estado de la conexión", () => {
  it("mercadoPagoConnectionStatus: los 4 resultados", () => {
    expect(mercadoPagoConnectionStatus({ configured: false, hasAccount: true, errorCode: null })).toBe(
      "not_configured",
    );
    expect(mercadoPagoConnectionStatus({ configured: true, hasAccount: false, errorCode: null })).toBe(
      "not_connected",
    );
    expect(mercadoPagoConnectionStatus({ configured: true, hasAccount: true, errorCode: "revoked" })).toBe(
      "needs_reconnect",
    );
    expect(mercadoPagoConnectionStatus({ configured: true, hasAccount: true, errorCode: null })).toBe("connected");
  });

  it("shouldWarnDepositWithoutMercadoPago: solo con servicios con seña y sin conexión", () => {
    expect(shouldWarnDepositWithoutMercadoPago({ hasActiveDepositServices: true, status: "not_connected" })).toBe(
      true,
    );
    expect(shouldWarnDepositWithoutMercadoPago({ hasActiveDepositServices: true, status: "needs_reconnect" })).toBe(
      true,
    );
    expect(shouldWarnDepositWithoutMercadoPago({ hasActiveDepositServices: true, status: "not_configured" })).toBe(
      true,
    );
    expect(shouldWarnDepositWithoutMercadoPago({ hasActiveDepositServices: true, status: "connected" })).toBe(false);
    expect(shouldWarnDepositWithoutMercadoPago({ hasActiveDepositServices: false, status: "not_connected" })).toBe(
      false,
    );
  });

  it("shouldSendThrottledAlert: tope de 24 h", () => {
    expect(shouldSendThrottledAlert(null, NOW)).toBe(true);
    expect(shouldSendThrottledAlert(new Date(NOW.getTime() - 23 * 60 * 60_000), NOW)).toBe(false);
    expect(shouldSendThrottledAlert(new Date(NOW.getTime() - 24 * 60 * 60_000), NOW)).toBe(true);
  });
});

describe("entorno", () => {
  it("allowsMercadoPagoEnvToken solo con flag, token y fuera de producción", () => {
    const base = { MERCADOPAGO_ALLOW_ENV_TOKEN: "true", MERCADOPAGO_ACCESS_TOKEN: "TEST-x", NODE_ENV: "development" };
    expect(allowsMercadoPagoEnvToken(base)).toBe(true);
    expect(allowsMercadoPagoEnvToken({ ...base, NODE_ENV: "production" })).toBe(false);
    expect(allowsMercadoPagoEnvToken({ ...base, MERCADOPAGO_ALLOW_ENV_TOKEN: undefined })).toBe(false);
    expect(allowsMercadoPagoEnvToken({ ...base, MERCADOPAGO_ALLOW_ENV_TOKEN: "false" })).toBe(false);
    expect(allowsMercadoPagoEnvToken({ ...base, MERCADOPAGO_ACCESS_TOKEN: "  " })).toBe(false);
  });

  it("requiresLiveMercadoPagoAccount solo en producción", () => {
    expect(requiresLiveMercadoPagoAccount({ NODE_ENV: "production" })).toBe(true);
    expect(requiresLiveMercadoPagoAccount({ NODE_ENV: "development" })).toBe(false);
    expect(requiresLiveMercadoPagoAccount({ NODE_ENV: "test" })).toBe(false);
  });
});

describe("MERCADOPAGO_TEXT", () => {
  it("tiene un texto por cada resultado del callback, y nada más", () => {
    const results: MercadoPagoCallbackResult[] = [
      "connected",
      "denied",
      "invalid_state",
      "rejected",
      "not_configured",
      "wrong_environment",
    ];
    expect(Object.keys(MERCADOPAGO_TEXT.callback).sort()).toEqual([...results].sort());
  });

  it("disconnectPending en singular y plural", () => {
    expect(MERCADOPAGO_TEXT.disconnectPending(1)).toBe(
      "Hay 1 seña esperando pago: si desconectás, se cancela ese turno y le avisamos al paciente.",
    );
    expect(MERCADOPAGO_TEXT.disconnectPending(3)).toBe(
      "Hay 3 señas esperando pago: si desconectás, se cancelan esos turnos y les avisamos a los pacientes.",
    );
  });

  it("errorAlert arma el motivo legible", () => {
    expect(MERCADOPAGO_TEXT.errorAlert(MERCADOPAGO_TEXT.errorReasons.refresh_failed)).toBe(
      "Mercado Pago se desconectó: no se pudo renovar el permiso. Hasta que reconectes, los pacientes no pueden pagar señas.",
    );
  });

  it("sin jerga técnica a la vista", () => {
    const flat = JSON.stringify(MERCADOPAGO_TEXT, (_k, v) => (typeof v === "function" ? v(2) : v));
    expect(flat).not.toMatch(/MERCADOPAGO_|token|OAuth|PKCE/i);
  });
});
