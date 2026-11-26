// HU-025a2 (6.1 paso 1): el login acepta cualquier identidad de Google verificada; no mira ninguna lista.
import { afterEach, describe, expect, it, vi } from "vitest";
import { authConfig, verifiedGoogleIdentity } from "./auth.config";

const account = { provider: "google", providerAccountId: "google-123", type: "oidc" as const };
const profile = { sub: "google-123", email_verified: true, email: " Carla@Example.invalid " };
type SignInArgs = Parameters<typeof authConfig.callbacks.signIn>[0];
const signIn = (over: { account?: unknown; profile?: unknown }) =>
  authConfig.callbacks.signIn({ user: {}, account, profile, ...over } as unknown as SignInArgs);

describe("HU-028b (D15): el login pide solo identidad básica", () => {
  it("los params del proveedor Google son exactamente { scope: \"openid email profile\" }", () => {
    const provider = authConfig.providers[0] as unknown as { options?: { authorization?: { params?: unknown } } };
    expect(provider.options?.authorization?.params).toEqual({ scope: "openid email profile" });
  });
});

describe("verifiedGoogleIdentity", () => {
  it("devuelve el sub y el email canónico", () => {
    expect(verifiedGoogleIdentity(account, profile)).toEqual({ subject: "google-123", email: "carla@example.invalid" });
  });
});

describe("authConfig.signIn", () => {
  afterEach(() => vi.restoreAllMocks());

  it("acepta una cuenta de Google verificada aunque no tenga membresía (queda pendiente)", () => {
    expect(signIn({})).toBe(true);
  });

  it.each([
    ["sin account", { account: null }],
    ["proveedor distinto", { account: { ...account, provider: "github" } }],
    ["sub ≠ providerAccountId", { account: { ...account, providerAccountId: "otro" } }],
    ["email_verified false", { profile: { ...profile, email_verified: false } }],
    ["email_verified como string", { profile: { ...profile, email_verified: "true" } }],
    ["sin sub", { profile: { ...profile, sub: undefined } }],
    ["email vacío", { profile: { ...profile, email: "   " } }],
    ["sin email", { profile: { ...profile, email: undefined } }],
    ["sin profile", { profile: undefined }],
  ])("%s → false, log solo con código", (_name, over) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(signIn(over)).toBe(false);
    expect(warn.mock.calls).toEqual([["[auth] sign_in_rejected reason=unverified_identity"]]);
  });

  it("ya no define authorized: la puerta por request es el middleware", () => {
    expect("authorized" in authConfig.callbacks).toBe(false);
  });
});
