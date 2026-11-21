import type { NextAuthConfig } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { configure, findUser, findAgenda, findProfessional, updateProfessional, updateScopedProfessional } = vi.hoisted(() => ({
  configure: vi.fn<(config: NextAuthConfig) => object>(() => ({})),
  findUser: vi.fn(),
  findAgenda: vi.fn(),
  findProfessional: vi.fn(),
  updateProfessional: vi.fn(),
  updateScopedProfessional: vi.fn(),
}));

vi.mock("next-auth", () => ({ default: configure }));
vi.mock("@nutri-bot/db", () => ({ prisma: {
  user: { findUnique: findUser },
  agenda: { findUnique: findAgenda },
  professional: { findUnique: findProfessional, update: updateProfessional, updateMany: updateScopedProfessional },
} }));

import "./auth";

const callbacks = configure.mock.calls[0]?.[0].callbacks;
if (!callbacks?.jwt) throw new Error("Missing Auth.js JWT callback");
const jwt = callbacks.jwt;
const account = { provider: "google", providerAccountId: "google-123", type: "oidc" } as const;
const profile = { sub: "google-123", email_verified: true, email: "test@example.invalid" };
const login = { token: {}, user: {}, account, profile, trigger: "signIn" } as const;
const calendarLogin = () => ({ ...login, token: {}, account: { ...account, refresh_token: "calendar-token" } });
const verifiedAgenda = { professional: { googleRefreshToken: null, googleSyncError: null } };

describe("private content identity callbacks", () => {
  beforeEach(() => {
    findUser.mockReset().mockResolvedValue({ id: "bound-user" });
    findProfessional.mockReset();
    updateProfessional.mockReset();
    findAgenda.mockReset().mockResolvedValue(verifiedAgenda);
    updateScopedProfessional.mockReset().mockResolvedValue({ count: 1 });
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

  it("preserves a plain session bootstrap without checking Calendar", async () => {
    const token = { privateContentUserId: "bound-user" };
    expect(await jwt({ token, user: {}, account: null })).toEqual(token);
    expect(findUser).not.toHaveBeenCalled();
    expect(findAgenda).not.toHaveBeenCalled();
    expect(findProfessional).not.toHaveBeenCalled();
    expect(updateProfessional).not.toHaveBeenCalled();
    expect(updateScopedProfessional).not.toHaveBeenCalled();
  });

  it("binds the Google user without storing a Calendar token when the original agenda is missing", async () => {
    findAgenda.mockResolvedValue(null);
    vi.stubEnv("GOOGLE_CALENDAR_OWNER_EMAIL", profile.email);
    try {
      expect(await jwt(calendarLogin())).toEqual({ privateContentUserId: "bound-user" });
      expect(updateProfessional).not.toHaveBeenCalled();
      expect(updateScopedProfessional).not.toHaveBeenCalled();
      expect(findAgenda).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([1, 0])("only writes to the verified owner while the agenda is attached (updated %i)", async (count) => {
    updateScopedProfessional.mockResolvedValue({ count });
    vi.stubEnv("GOOGLE_CALENDAR_OWNER_EMAIL", profile.email);
    try {
      expect(await jwt(calendarLogin())).toEqual({ privateContentUserId: "bound-user" });
      expect(findAgenda).toHaveBeenCalledOnce();
      expect(findAgenda).toHaveBeenCalledWith(expect.objectContaining({
        where: { id_tenantId: { id: "legacy-agenda", tenantId: "legacy-tenant" }, isPrimary: true, professionalId: 1 },
      }));
      expect(updateScopedProfessional).toHaveBeenCalledOnce();
      expect(updateScopedProfessional).toHaveBeenCalledWith({
        where: {
          id: 1,
          tenantId: "legacy-tenant",
          agendas: { some: { id: "legacy-agenda", tenantId: "legacy-tenant", isPrimary: true } },
        },
        data: { googleRefreshToken: "calendar-token", googleSyncError: null },
      });
      expect(findProfessional).not.toHaveBeenCalled();
      expect(updateProfessional).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not treat an agenda database error as failed agenda verification", async () => {
    const error = new Error("database unavailable");
    findAgenda.mockRejectedValue(error);
    await expect(jwt(calendarLogin())).rejects.toBe(error);
    expect(findUser).not.toHaveBeenCalled();
    expect(updateScopedProfessional).not.toHaveBeenCalled();
  });
});
