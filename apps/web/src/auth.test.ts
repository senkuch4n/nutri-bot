import type { NextAuthConfig } from "next-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configure: vi.fn<(config: NextAuthConfig) => object>(() => ({})),
  registerGoogleIdentity: vi.fn(),
  loadAccessFacts: vi.fn(),
  findAgenda: vi.fn(),
  findProfessional: vi.fn(),
  updateProfessional: vi.fn(),
  updateScopedProfessional: vi.fn(),
}));

vi.mock("next-auth", () => ({ default: mocks.configure }));
vi.mock("@nutri-bot/db", () => ({ prisma: {
  agenda: { findUnique: mocks.findAgenda },
  professional: { findUnique: mocks.findProfessional, update: mocks.updateProfessional, updateMany: mocks.updateScopedProfessional },
} }));
vi.mock("@nutri-bot/db/domain", () => ({
  LEGACY_TENANT_ID: "legacy-tenant",
  registerGoogleIdentity: mocks.registerGoogleIdentity,
  loadAccessFacts: mocks.loadAccessFacts,
}));

import "./auth";

const callbacks = mocks.configure.mock.calls[0]?.[0].callbacks;
if (!callbacks?.jwt) throw new Error("Missing Auth.js JWT callback");
const jwt = callbacks.jwt;
const account = { provider: "google", providerAccountId: "google-123", type: "oidc" } as const;
const profile = { sub: "google-123", email_verified: true, email: " Test@Example.invalid " };
const login = { token: {}, user: {}, account, profile, trigger: "signIn" } as const;
const calendarLogin = () => ({ ...login, token: {}, account: { ...account, refresh_token: "calendar-token" } });
const verifiedAgenda = { professional: { googleRefreshToken: null, googleSyncError: null } };
const facts = (memberships: { tenantId: string; role: "OWNER" | "STAFF" }[]) =>
  ({ linked: true, memberships, platformOperator: false, activeSupportGrants: [] });
const legacyOwner = facts([{ tenantId: "legacy-tenant", role: "OWNER" }]);

describe("Auth.js: registro de identidad (HU-025a1)", () => {
  beforeEach(() => {
    mocks.registerGoogleIdentity.mockReset().mockResolvedValue({ status: "linked", userId: "user-a" });
    mocks.loadAccessFacts.mockReset().mockResolvedValue(legacyOwner);
    mocks.findProfessional.mockReset();
    mocks.updateProfessional.mockReset();
    mocks.findAgenda.mockReset().mockResolvedValue(verifiedAgenda);
    mocks.updateScopedProfessional.mockReset().mockResolvedValue({ count: 1 });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("registra la identidad verificada con email canónico y guarda solo userId en el JWT y la sesión", async () => {
    const token = await jwt({ ...login, token: { privateContentUserId: "viejo", email: "x", sub: "authjs-sub" } });
    expect(mocks.registerGoogleIdentity).toHaveBeenCalledOnce();
    expect(mocks.registerGoogleIdentity).toHaveBeenCalledWith({ subject: "google-123", email: "test@example.invalid" });
    expect(token).toEqual({ email: "x", sub: "authjs-sub", userId: "user-a" });
    const session = { user: { email: "test@example.invalid" }, expires: "2030-01-01" };
    expect(await callbacks.session!({ session, token: token! } as Parameters<NonNullable<typeof callbacks.session>>[0]))
      .toEqual({ ...session, userId: "user-a" });
  });

  it("un User pendiente (sin membresía) también queda con userId: el acceso se decide por request", async () => {
    mocks.loadAccessFacts.mockResolvedValue(facts([]));
    expect(await jwt(login)).toEqual({ userId: "user-a" });
    expect(mocks.loadAccessFacts).not.toHaveBeenCalled(); // sin refresh_token no hay nada que decidir
  });

  it("conflicto de identidad (email igual, sub distinto) → sin userId y log solo con código", async () => {
    mocks.registerGoogleIdentity.mockResolvedValue({ status: "conflict" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await jwt({ ...login, token: { userId: "viejo" } })).toEqual({});
      expect(warn).toHaveBeenCalledWith("[auth] identity_conflict");
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/example\.invalid|google-123/);
    } finally {
      warn.mockRestore();
    }
  });

  it.each([
    ["proveedor distinto", { account: { ...account, provider: "other" } }],
    ["sub ≠ providerAccountId", { account: { ...account, providerAccountId: "different" } }],
    ["sub vacío", { profile: { ...profile, sub: "" } }],
    ["email_verified false", { profile: { ...profile, email_verified: false } }],
    ["email_verified ausente", { profile: { ...profile, email_verified: undefined } }],
    ["email vacío", { profile: { ...profile, email: "   " } }],
    ["email ausente", { profile: { ...profile, email: undefined } }],
    ["sin profile", { profile: undefined }],
  ])("no registra un login inválido (%s) y borra claims previos", async (_label, override) => {
    expect(await jwt({ ...login, ...override, token: { userId: "old", privateContentUserId: "old" } })).toEqual({});
    expect(mocks.registerGoogleIdentity).not.toHaveBeenCalled();
    expect(mocks.updateScopedProfessional).not.toHaveBeenCalled();
  });

  it.each([{}, { userId: "original" }])("ignora session.update() del cliente con claims %j", async (claims) => {
    const token = { ...claims };
    expect(await jwt({ token, user: {}, account: null, trigger: "update", session: {
      userId: "forged", tenantId: "forged-tenant", role: "OWNER",
    } })).toEqual(claims);
    expect(mocks.registerGoogleIdentity).not.toHaveBeenCalled();
  });

  it("un request sin login conserva el JWT sin tocar la base", async () => {
    const token = { userId: "user-a" };
    expect(await jwt({ token, user: {}, account: null })).toEqual(token);
    expect(mocks.registerGoogleIdentity).not.toHaveBeenCalled();
    expect(mocks.loadAccessFacts).not.toHaveBeenCalled();
    expect(mocks.findAgenda).not.toHaveBeenCalled();
    expect(mocks.updateScopedProfessional).not.toHaveBeenCalled();
  });

  it("la sesión no expone un userId vacío", async () => {
    const session = { user: {}, expires: "2030-01-01" };
    expect(await callbacks.session!({ session, token: { userId: "" } } as Parameters<NonNullable<typeof callbacks.session>>[0]))
      .toEqual(session);
  });

  describe("D10: token del calendario solo para miembros del consultorio original", () => {
    it.each([1, 0])("miembro de legacy y dueña del calendario → escribe la agenda legacy (updated %i)", async (count) => {
      mocks.updateScopedProfessional.mockResolvedValue({ count });
      vi.stubEnv("GOOGLE_CALENDAR_OWNER_EMAIL", "test@example.invalid");
      expect(await jwt(calendarLogin())).toEqual({ userId: "user-a" });
      expect(mocks.loadAccessFacts).toHaveBeenCalledWith("user-a", expect.any(Date));
      expect(mocks.findAgenda).toHaveBeenCalledWith(expect.objectContaining({
        where: { id_tenantId: { id: "legacy-agenda", tenantId: "legacy-tenant" }, isPrimary: true, professionalId: 1 },
      }));
      expect(mocks.updateScopedProfessional).toHaveBeenCalledOnce();
      expect(mocks.updateScopedProfessional).toHaveBeenCalledWith({
        where: {
          id: 1,
          tenantId: "legacy-tenant",
          agendas: { some: { id: "legacy-agenda", tenantId: "legacy-tenant", isPrimary: true } },
        },
        data: { googleRefreshToken: "calendar-token", googleSyncError: null },
      });
      expect(mocks.findProfessional).not.toHaveBeenCalled();
      expect(mocks.updateProfessional).not.toHaveBeenCalled();
    });

    it.each([
      ["sin membresía (pendiente)", facts([])],
      ["miembro de otro consultorio", facts([{ tenantId: "tenant-b", role: "OWNER" }])],
      ["dos membresías", facts([{ tenantId: "legacy-tenant", role: "OWNER" }, { tenantId: "tenant-b", role: "STAFF" }])],
      ["User inexistente", null],
    ])("%s → no guarda el token aunque sea la dueña del calendario", async (_label, value) => {
      mocks.loadAccessFacts.mockResolvedValue(value);
      vi.stubEnv("GOOGLE_CALENDAR_OWNER_EMAIL", "test@example.invalid");
      expect(await jwt(calendarLogin())).toEqual({ userId: "user-a" });
      expect(mocks.findAgenda).not.toHaveBeenCalled();
      expect(mocks.updateScopedProfessional).not.toHaveBeenCalled();
    });

    it("miembro de legacy pero no la dueña del calendario → no guarda", async () => {
      vi.stubEnv("GOOGLE_CALENDAR_OWNER_EMAIL", "otra@example.invalid");
      expect(await jwt(calendarLogin())).toEqual({ userId: "user-a" });
      expect(mocks.updateScopedProfessional).not.toHaveBeenCalled();
    });

    it("conflicto de identidad → no consulta membresía ni guarda token", async () => {
      mocks.registerGoogleIdentity.mockResolvedValue({ status: "conflict" });
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("GOOGLE_CALENDAR_OWNER_EMAIL", "test@example.invalid");
      expect(await jwt(calendarLogin())).toEqual({});
      expect(mocks.loadAccessFacts).not.toHaveBeenCalled();
      expect(mocks.updateScopedProfessional).not.toHaveBeenCalled();
      vi.mocked(console.warn).mockRestore();
    });

    it("agenda original ausente → registra la identidad sin guardar el token", async () => {
      mocks.findAgenda.mockResolvedValue(null);
      vi.stubEnv("GOOGLE_CALENDAR_OWNER_EMAIL", "test@example.invalid");
      expect(await jwt(calendarLogin())).toEqual({ userId: "user-a" });
      expect(mocks.findAgenda).toHaveBeenCalledOnce();
      expect(mocks.updateScopedProfessional).not.toHaveBeenCalled();
    });

    it("un error de base al verificar la agenda no se trata como agenda ausente", async () => {
      const error = new Error("database unavailable");
      mocks.findAgenda.mockRejectedValue(error);
      await expect(jwt(calendarLogin())).rejects.toBe(error);
      expect(mocks.updateScopedProfessional).not.toHaveBeenCalled();
    });
  });
});
