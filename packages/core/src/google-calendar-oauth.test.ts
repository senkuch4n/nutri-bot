import { describe, expect, it } from "vitest";
import {
  GOOGLE_CALENDAR_TEXT,
  buildGoogleCalendarAuthorizationUrl,
  decideGoogleCalendarConnection,
  googleCalendarRedirectUri,
  hasGoogleCalendarEventsScope,
  parseGoogleCalendarCallback,
  parseGoogleIdTokenClaims,
  parseGoogleTokenResponse,
} from "./google-calendar-oauth";
import { SETTINGS_TEXT } from "./settings-options";

const CLIENT_ID = "client-123.apps.googleusercontent.com";
const NOW = new Date("2026-11-25T12:00:00Z");
const FUTURE_EXP = Math.floor(NOW.getTime() / 1000) + 3600;

function b64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function idToken(claims: Record<string, unknown> | string, segments = 3): string {
  const payload = typeof claims === "string" ? b64url(claims) : b64url(JSON.stringify(claims));
  const parts = [b64url(JSON.stringify({ alg: "RS256" })), payload, "firma"];
  return parts.slice(0, segments).join(".");
}

const VALID = {
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  sub: "1100220033",
  email: "  Daiana@Example.COM ",
  email_verified: true,
  exp: FUTURE_EXP,
};

describe("buildGoogleCalendarAuthorizationUrl", () => {
  it("arma la URL exacta con los 9 parámetros en orden", () => {
    const url = buildGoogleCalendarAuthorizationUrl({
      clientId: CLIENT_ID,
      redirectUri: "https://numa.arzium.com.ar/api/google-calendar/oauth/callback",
      state: "st",
      codeChallenge: "ch",
    });
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect([...parsed.searchParams.keys()]).toEqual([
      "client_id",
      "redirect_uri",
      "response_type",
      "scope",
      "access_type",
      "prompt",
      "state",
      "code_challenge",
      "code_challenge_method",
    ]);
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      client_id: CLIENT_ID,
      redirect_uri: "https://numa.arzium.com.ar/api/google-calendar/oauth/callback",
      response_type: "code",
      scope: "openid email https://www.googleapis.com/auth/calendar.events",
      access_type: "offline",
      prompt: "consent",
      state: "st",
      code_challenge: "ch",
      code_challenge_method: "S256",
    });
    expect(url).not.toContain("include_granted_scopes");
    expect(url).not.toContain("profile");
  });
});

describe("googleCalendarRedirectUri", () => {
  it("usa el origin de AUTH_URL", () => {
    expect(googleCalendarRedirectUri("https://numa.arzium.com.ar/x")).toBe(
      "https://numa.arzium.com.ar/api/google-calendar/oauth/callback",
    );
    expect(googleCalendarRedirectUri("http://localhost:3000")).toBe(
      "http://localhost:3000/api/google-calendar/oauth/callback",
    );
  });

  it.each([undefined, null, "", "nota url", "ftp://x"])("%s → null", (value) => {
    expect(googleCalendarRedirectUri(value)).toBeNull();
  });
});

describe("parseGoogleCalendarCallback", () => {
  it("error=access_denied con state → denied con state", () => {
    expect(parseGoogleCalendarCallback(new URLSearchParams("error=access_denied&state=s"))).toEqual({
      kind: "denied",
      state: "s",
    });
  });
  it("error presente aunque venga code → denied", () => {
    expect(parseGoogleCalendarCallback(new URLSearchParams("error=x&code=c&state=s"))).toEqual({
      kind: "denied",
      state: "s",
    });
  });
  it("sin code → denied sin state", () => {
    expect(parseGoogleCalendarCallback(new URLSearchParams(""))).toEqual({ kind: "denied", state: null });
  });
  it("code sin state → invalid", () => {
    expect(parseGoogleCalendarCallback(new URLSearchParams("code=c"))).toEqual({ kind: "invalid" });
  });
  it("ok", () => {
    expect(parseGoogleCalendarCallback(new URLSearchParams("code=c&state=s&scope=x"))).toEqual({
      kind: "ok",
      code: "c",
      state: "s",
    });
  });
});

describe("parseGoogleTokenResponse", () => {
  it("devuelve refresh token, id_token y scope, sin access token", () => {
    const res = parseGoogleTokenResponse({
      access_token: "at",
      refresh_token: "rt",
      id_token: "it",
      scope: "openid email",
      expires_in: 3599,
    });
    expect(res).toEqual({ refreshToken: "rt", idToken: "it", scope: "openid email" });
    expect(res).not.toHaveProperty("accessToken");
    expect(JSON.stringify(res)).not.toContain("at\"");
  });
  it("scope ausente → null", () => {
    expect(parseGoogleTokenResponse({ refresh_token: "rt", id_token: "it" })).toEqual({
      refreshToken: "rt",
      idToken: "it",
      scope: null,
    });
  });
  it.each([
    ["sin refresh_token", { access_token: "at", id_token: "it" }],
    ["sin id_token", { access_token: "at", refresh_token: "rt" }],
    ["refresh_token vacío", { refresh_token: " ", id_token: "it" }],
    ["no objeto", "texto"],
    ["null", null],
    ["array", ["rt"]],
  ])("%s → null", (_name, json) => {
    expect(parseGoogleTokenResponse(json)).toBeNull();
  });
});

describe("parseGoogleIdTokenClaims", () => {
  const opts = { clientId: CLIENT_ID, now: NOW };

  it("válido → subject y email canónico", () => {
    expect(parseGoogleIdTokenClaims(idToken(VALID), opts)).toEqual({
      subject: "1100220033",
      email: "daiana@example.com",
    });
  });
  it("iss sin https y aud array con azp correcto → válido", () => {
    expect(
      parseGoogleIdTokenClaims(idToken({ ...VALID, iss: "accounts.google.com", aud: [CLIENT_ID, "otro"], azp: CLIENT_ID }), opts),
    ).toEqual({ subject: "1100220033", email: "daiana@example.com" });
  });
  it.each([
    ["aud distinto", { ...VALID, aud: "otro-cliente" }],
    ["aud array sin azp", { ...VALID, aud: [CLIENT_ID, "otro"] }],
    ["azp distinto", { ...VALID, azp: "otro-cliente" }],
    ["iss ajeno", { ...VALID, iss: "https://evil.example.com" }],
    ["vencido", { ...VALID, exp: Math.floor(NOW.getTime() / 1000) - 1 }],
    ["exp no numérico", { ...VALID, exp: "9999999999" }],
    ["email_verified string", { ...VALID, email_verified: "true" }],
    ["email_verified false", { ...VALID, email_verified: false }],
    ["sin sub", { ...VALID, sub: undefined }],
    ["sub vacío", { ...VALID, sub: "" }],
    ["sub demasiado largo", { ...VALID, sub: "x".repeat(256) }],
    ["sin email", { ...VALID, email: "" }],
  ])("%s → null", (_name, claims) => {
    expect(parseGoogleIdTokenClaims(idToken(claims as Record<string, unknown>), opts)).toBeNull();
  });
  it("payload no JSON → null", () => {
    expect(parseGoogleIdTokenClaims(idToken("no es json"), opts)).toBeNull();
  });
  it("2 segmentos → null", () => {
    expect(parseGoogleIdTokenClaims(idToken(VALID, 2), opts)).toBeNull();
  });
});

describe("hasGoogleCalendarEventsScope", () => {
  it("con el scope → true", () => {
    expect(hasGoogleCalendarEventsScope("openid https://www.googleapis.com/auth/calendar.events email")).toBe(true);
  });
  it("sin el scope, readonly o null → false", () => {
    expect(hasGoogleCalendarEventsScope("openid email")).toBe(false);
    expect(hasGoogleCalendarEventsScope("openid https://www.googleapis.com/auth/calendar.events.readonly")).toBe(false);
    expect(hasGoogleCalendarEventsScope(null)).toBe(false);
  });
});

describe("decideGoogleCalendarConnection (D8)", () => {
  it("sin conexión previa → first", () => {
    expect(decideGoogleCalendarConnection({ hadConnection: false, previousSubject: "a", nextSubject: "b" })).toBe("first");
  });
  it("anterior desconocida → same", () => {
    expect(decideGoogleCalendarConnection({ hadConnection: true, previousSubject: null, nextSubject: "b" })).toBe("same");
  });
  it("misma cuenta → same", () => {
    expect(decideGoogleCalendarConnection({ hadConnection: true, previousSubject: "a", nextSubject: "a" })).toBe("same");
  });
  it("otra cuenta → changed", () => {
    expect(decideGoogleCalendarConnection({ hadConnection: true, previousSubject: "a", nextSubject: "b" })).toBe("changed");
  });
});

describe("textos", () => {
  it("GOOGLE_CALENDAR_TEXT.callback tiene los 6 textos exactos", () => {
    expect(GOOGLE_CALENDAR_TEXT.account).toBe("Cuenta");
    expect(GOOGLE_CALENDAR_TEXT.callback).toEqual({
      connected: "Google Calendar conectado.",
      denied: "No se conectó el calendario: la autorización fue cancelada en Google.",
      invalid_state: "No pudimos verificar la conexión. Probá de nuevo.",
      rejected: "Google rechazó la conexión. Probá de nuevo; si se repite, avisá al soporte.",
      scope_denied: "Para sincronizar los turnos hace falta permitir el acceso a los eventos del calendario.",
      not_configured: "La conexión con Google Calendar no está configurada en el servidor.",
    });
  });
  it("SETTINGS_TEXT.googleDisconnectDescription (HU 4.2)", () => {
    expect(SETTINGS_TEXT.googleDisconnectDescription).toBe(
      "Los turnos nuevos dejan de aparecer en tu Google Calendar. Los eventos que ya están ahí no se borran.",
    );
  });
});
