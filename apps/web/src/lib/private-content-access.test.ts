import { beforeEach, describe, expect, it, vi } from "vitest";

const { getTenantContext } = vi.hoisted(() => ({ getTenantContext: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./tenant-context", () => ({ getTenantContext }));

import { resolvePrivateContentAccess } from "./private-content-access";

const member = (userId: string, tenantId: string, role: "OWNER" | "STAFF") => ({
  userId,
  tenantId,
  agendaId: "agenda",
  professionalId: 1,
  access: { kind: "member", tenantId, role },
});
const support = (mode: "READ_ONLY" | "READ_WRITE") => ({
  userId: "operator",
  tenantId: "legacy-tenant",
  agendaId: "agenda",
  professionalId: 1,
  access: { kind: "support", tenantId: "legacy-tenant", grantId: "g", mode, expiresAt: new Date("2030-01-01") },
});

describe("resolvePrivateContentAccess (wrapper de getTenantContext)", () => {
  beforeEach(() => {
    getTenantContext.mockReset();
  });

  it("sin contexto (sin sesión, sin userId, pendiente, ambigua, fuera del candado) → null", async () => {
    getTenantContext.mockResolvedValue(null);
    expect(await resolvePrivateContentAccess()).toBeNull();
    expect(await resolvePrivateContentAccess("read")).toBeNull();
  });

  it.each([
    ["user-a", "legacy-tenant", "OWNER"],
    ["user-b", "legacy-tenant", "STAFF"],
  ] as const)("resuelve %s desde la membresía del contexto en %s (%s)", async (userId, tenantId, role) => {
    getTenantContext.mockResolvedValue(member(userId, tenantId, role));
    expect(await resolvePrivateContentAccess()).toEqual({ userId, tenantId, role });
    expect(getTenantContext).toHaveBeenCalledTimes(1);
    expect(getTenantContext).toHaveBeenCalledWith();
  });

  it("revalida en cada operación: membresía revocada sin sesión nueva → null", async () => {
    getTenantContext.mockResolvedValueOnce(member("user-a", "legacy-tenant", "OWNER")).mockResolvedValueOnce(null);
    expect(await resolvePrivateContentAccess()).toEqual({ userId: "user-a", tenantId: "legacy-tenant", role: "OWNER" });
    expect(await resolvePrivateContentAccess()).toBeNull();
    expect(getTenantContext).toHaveBeenCalledTimes(2);
  });

  it("soporte de solo lectura (025d): lee como STAFF, no escribe", async () => {
    getTenantContext.mockResolvedValue(support("READ_ONLY"));
    expect(await resolvePrivateContentAccess("read")).toEqual({ userId: "operator", tenantId: "legacy-tenant", role: "STAFF" });
    expect(await resolvePrivateContentAccess("write")).toBeNull();
    expect(await resolvePrivateContentAccess()).toBeNull(); // default "write"
  });

  it("soporte con permiso para editar (025d): STAFF en los dos modos", async () => {
    getTenantContext.mockResolvedValue(support("READ_WRITE"));
    expect(await resolvePrivateContentAccess("write")).toEqual({ userId: "operator", tenantId: "legacy-tenant", role: "STAFF" });
  });
});
