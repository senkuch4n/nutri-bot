// HU-025a2: contexto de tenant del lado servidor (sin base ni red).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  loadAccessFacts: vi.fn(),
  findAgenda: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
  headers: vi.fn(),
  cookies: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ headers: mocks.headers, cookies: mocks.cookies }));
vi.mock("@nutri-bot/db", () => ({ prisma: { agenda: { findFirst: mocks.findAgenda } } }));
vi.mock("@nutri-bot/db/domain", () => ({
  LEGACY_TENANT_ID: "legacy-tenant",
  loadAccessFacts: mocks.loadAccessFacts,
}));

import {
  ENABLED_TENANT_IDS,
  TenantAccessError,
  getTenantAccess,
  getTenantContext,
  requireOwnerContext,
  requirePageContext,
  requireTenantContext,
} from "./tenant-context";

type Role = "OWNER" | "STAFF";
const facts = (memberships: { tenantId: string; role: Role }[], linked = true) =>
  ({ linked, memberships, platformOperator: false, activeSupportGrants: [] });
const session = { userId: "user-a", user: { email: "ana@example.test" }, expires: "2030-01-01" };
const legacyAgenda = { id: "legacy-agenda", professionalId: 1 };
const ownerCtx = {
  userId: "user-a",
  tenantId: "legacy-tenant",
  agendaId: "legacy-agenda",
  professionalId: 1,
  access: { kind: "member", tenantId: "legacy-tenant", role: "OWNER" },
};

async function codeOf(run: () => Promise<unknown>) {
  const error = await run().then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(TenantAccessError);
  return (error as TenantAccessError).code;
}

describe("getTenantAccess / getTenantContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(session);
    mocks.loadAccessFacts.mockResolvedValue(facts([{ tenantId: "legacy-tenant", role: "OWNER" }]));
    mocks.findAgenda.mockResolvedValue(legacyAgenda);
  });

  it("el candado transitorio es solo el consultorio original", () => {
    expect(ENABLED_TENANT_IDS).toEqual(["legacy-tenant"]);
  });

  it("miembro OWNER del consultorio original → contexto con su agenda principal", async () => {
    expect(await getTenantAccess()).toEqual({ ok: true, ctx: ownerCtx });
    expect(mocks.loadAccessFacts).toHaveBeenCalledWith("user-a", expect.any(Date));
    expect(mocks.findAgenda).toHaveBeenCalledWith({
      where: { tenantId: "legacy-tenant", isPrimary: true },
      select: { id: true, professionalId: true },
    });
  });

  it("STAFF también obtiene contexto (D3: mismos permisos sobre los datos)", async () => {
    mocks.loadAccessFacts.mockResolvedValue(facts([{ tenantId: "legacy-tenant", role: "STAFF" }]));
    expect(await getTenantContext()).toEqual({ ...ownerCtx, access: { ...ownerCtx.access, role: "STAFF" } });
  });

  it("sin sesión → unauthenticated, sin tocar la base", async () => {
    mocks.auth.mockResolvedValue(null);
    expect(await getTenantAccess()).toEqual({ ok: false, reason: "unauthenticated", email: null });
    expect(mocks.loadAccessFacts).not.toHaveBeenCalled();
    expect(await getTenantContext()).toBeNull();
  });

  it.each([
    ["conflicto de identidad (sin userId)", { user: { email: "ana@example.test" } }],
    ["JWT anterior a HU-025 (solo el claim viejo)", { user: { email: "ana@example.test" }, privateContentUserId: "user-a" }],
    ["userId vacío", { userId: "", user: { email: "ana@example.test" } }],
  ])("%s → unlinked con el email de la sesión, sin tocar la base", async (_name, s) => {
    mocks.auth.mockResolvedValue(s);
    expect(await getTenantAccess()).toEqual({ ok: false, reason: "unlinked", email: "ana@example.test" });
    expect(mocks.loadAccessFacts).not.toHaveBeenCalled();
  });

  it("User inexistente → unlinked", async () => {
    mocks.loadAccessFacts.mockResolvedValue(null);
    expect(await getTenantAccess()).toEqual({ ok: false, reason: "unlinked", email: "ana@example.test" });
  });

  it("identidad pendiente → no_membership", async () => {
    mocks.loadAccessFacts.mockResolvedValue(facts([]));
    expect(await getTenantAccess()).toEqual({ ok: false, reason: "no_membership", email: "ana@example.test" });
    expect(mocks.findAgenda).not.toHaveBeenCalled();
  });

  it("dos membresías (D7) → multiple_memberships", async () => {
    mocks.loadAccessFacts.mockResolvedValue(facts([
      { tenantId: "legacy-tenant", role: "OWNER" },
      { tenantId: "tenant-b", role: "STAFF" },
    ]));
    expect(await getTenantAccess()).toEqual({ ok: false, reason: "multiple_memberships", email: "ana@example.test" });
  });

  it("membresía en un tenant fuera del candado → tenant_not_enabled", async () => {
    mocks.loadAccessFacts.mockResolvedValue(facts([{ tenantId: "tenant-b", role: "OWNER" }]));
    expect(await getTenantAccess()).toEqual({ ok: false, reason: "tenant_not_enabled", email: "ana@example.test" });
    expect(mocks.findAgenda).not.toHaveBeenCalled();
  });

  it("agenda principal ausente → sin contexto y log solo con código", async () => {
    mocks.findAgenda.mockResolvedValue(null);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await getTenantAccess()).toEqual({ ok: false, reason: "tenant_not_enabled", email: "ana@example.test" });
      expect(log.mock.calls).toEqual([["[auth] tenant_scope_missing"]]);
    } finally {
      log.mockRestore();
    }
  });

  it("membresía revocada entre dos llamadas → la segunda ya no tiene contexto (sin cache entre requests)", async () => {
    mocks.loadAccessFacts
      .mockResolvedValueOnce(facts([{ tenantId: "legacy-tenant", role: "OWNER" }]))
      .mockResolvedValueOnce(facts([]));
    expect(await getTenantContext()).toEqual(ownerCtx);
    expect(await getTenantContext()).toBeNull();
    expect(mocks.loadAccessFacts).toHaveBeenCalledTimes(2);
  });

  it("nunca lee el tenant de la request: ignora un header x-tenant-id y campos forjados en la sesión", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "x-tenant-id": "tenant-b" }));
    mocks.cookies.mockResolvedValue({ get: () => ({ value: "tenant-b" }) });
    mocks.auth.mockResolvedValue({ ...session, tenantId: "tenant-b", agendaId: "agenda-b", role: "OWNER" });
    expect(await getTenantContext()).toEqual(ownerCtx);
    expect(mocks.headers).not.toHaveBeenCalled();
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.auth).toHaveBeenCalledWith();
  });
});

describe("requireTenantContext / requireOwnerContext / requirePageContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(session);
    mocks.loadAccessFacts.mockResolvedValue(facts([{ tenantId: "legacy-tenant", role: "OWNER" }]));
    mocks.findAgenda.mockResolvedValue(legacyAgenda);
  });

  it.each(["read", "write", undefined] as const)("con contexto devuelve el contexto (modo %s)", async (mode) => {
    expect(await requireTenantContext(mode)).toEqual(ownerCtx);
  });

  it("sin contexto → TenantAccessError no_context", async () => {
    mocks.loadAccessFacts.mockResolvedValue(facts([]));
    expect(await codeOf(() => requireTenantContext("read"))).toBe("no_context");
    expect(await codeOf(() => requireOwnerContext())).toBe("no_context");
  });

  it("requireOwnerContext con STAFF → owner_only", async () => {
    mocks.loadAccessFacts.mockResolvedValue(facts([{ tenantId: "legacy-tenant", role: "STAFF" }]));
    expect(await codeOf(() => requireOwnerContext())).toBe("owner_only");
  });

  it("requireOwnerContext con OWNER → contexto", async () => {
    expect(await requireOwnerContext()).toEqual(ownerCtx);
  });

  it("requirePageContext sin contexto → redirect a /inicio", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(requirePageContext()).rejects.toMatchObject({ url: "/inicio" });
    expect(mocks.redirect).toHaveBeenCalledWith("/inicio");
  });

  it("requirePageContext con contexto → no redirige", async () => {
    expect(await requirePageContext()).toEqual(ownerCtx);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
