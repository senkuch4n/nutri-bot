import type { NextAuthConfig } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { configure, findUser, findProfessional, updateProfessional } = vi.hoisted(() => ({
  configure: vi.fn<(config: NextAuthConfig) => object>(() => ({})),
  findUser: vi.fn(),
  findProfessional: vi.fn(),
  updateProfessional: vi.fn(),
}));

vi.mock("next-auth", () => ({ default: configure }));
vi.mock("@nutri-bot/db", () => ({ prisma: {
  user: { findUnique: findUser },
  professional: { findUnique: findProfessional, update: updateProfessional },
} }));

import "./auth";

const callbacks = configure.mock.calls[0]?.[0].callbacks;
if (!callbacks?.jwt) throw new Error("Missing Auth.js JWT callback");
const jwt = callbacks.jwt;
const account = { provider: "google", providerAccountId: "google-123", type: "oidc" } as const;
const profile = { sub: "google-123", email_verified: true, email: "test@example.invalid" };
const login = { token: {}, user: {}, account, profile, trigger: "signIn" } as const;

describe("private content identity callbacks", () => {
  beforeEach(() => {
    findUser.mockReset().mockResolvedValue({ id: "bound-user" });
    findProfessional.mockReset();
    updateProfessional.mockReset();
  });

  it("binds only the stored user id from the verified Google subject", async () => {
    const token = await jwt(login);
    expect(findUser).toHaveBeenCalledTimes(1);
    expect(findUser).toHaveBeenCalledWith({
      where: { googleSubject: profile.sub }, select: { id: true },
    });
    expect(token).toEqual({ privateContentUserId: "bound-user" });
    const session = { user: { email: profile.email }, expires: "2030-01-01" };
    expect(await callbacks.session!({ session, token: token! } as Parameters<NonNullable<typeof callbacks.session>>[0]))
      .toEqual({ ...session, privateContentUserId: "bound-user" });
  });

  it.each([
    { account: { ...account, provider: "other" } },
    { account: { ...account, providerAccountId: "different" } },
    { profile: { ...profile, sub: "" } },
    { profile: { ...profile, email_verified: false } },
    { profile: { ...profile, email_verified: undefined } },
    { profile: undefined },
  ])("does not bind an invalid login (%j)", async (override) => {
    expect(await jwt({ ...login, ...override, token: { privateContentUserId: "old" } })).toEqual({});
    expect(findUser).not.toHaveBeenCalled();
  });

  it("does not bind a verified but unregistered Google subject", async () => {
    findUser.mockResolvedValue(null);
    const token = { email: profile.email, sub: "authjs-sub" };
    expect(await jwt({ ...login, token })).toEqual({ email: profile.email, sub: "authjs-sub" });
    expect(findUser).toHaveBeenCalledOnce();
  });

  it.each([{}, { privateContentUserId: "original" }])(
    "ignores client session updates with signed claims %j", async (claims) => {
      const token = { ...claims };
      expect(await jwt({ token, user: {}, account: null, trigger: "update", session: {
        privateContentUserId: "forged", tenantId: "forged-tenant", role: "OWNER",
      } })).toEqual(claims);
      expect(findUser).not.toHaveBeenCalled();
    },
  );

  it("preserves the legacy calendar refresh token bootstrap", async () => {
    findProfessional.mockResolvedValue({ googleRefreshToken: null, googleSyncError: null });
    vi.stubEnv("GOOGLE_CALENDAR_OWNER_EMAIL", profile.email);
    try {
      await jwt({ ...login, account: { ...account, refresh_token: "calendar-token" }, token: {} });
      expect(updateProfessional).toHaveBeenCalledTimes(1);
      expect(updateProfessional).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { googleRefreshToken: "calendar-token", googleSyncError: null },
        select: { id: true },
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
