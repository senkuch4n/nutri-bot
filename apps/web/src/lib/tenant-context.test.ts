// HU-025a2: contexto de tenant del lado servidor (sin base ni red).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  loadAccessFacts: vi.fn(),
  loadOnboardedClinic: vi.fn(),
  getTenantSubscriptionGate: vi.fn(),
  findAgenda: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
  headers: vi.fn(),
  cookies: vi.fn(),
  decide: null as null | ((...args: unknown[]) => unknown),
  TenantScopeError: class TenantScopeError extends Error {},
}));
vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ headers: mocks.headers, cookies: mocks.cookies }));
vi.mock("./onboarding-server", () => ({ loadOnboardedClinic: mocks.loadOnboardedClinic }));
vi.mock("./onboarding-subscription-gate", () => ({ getTenantSubscriptionGate: mocks.getTenantSubscriptionGate }));
const fakePrisma = vi.hoisted(() => ({ marker: "prisma" }));
vi.mock("@nutri-bot/db", () => ({ prisma: fakePrisma }));
// HU-025b-2: getTenantAccess usa resolvePrimaryAgenda (tenantScope). `findAgenda` devuelve la agenda
// principal ({ id, professionalId }) o null; el doble tira TenantScopeError como el real.
vi.mock("@nutri-bot/db/domain", () => ({
  LEGACY_TENANT_ID: "legacy-tenant",
  loadAccessFacts: mocks.loadAccessFacts,
  TenantScopeError: mocks.TenantScopeError,
  resolvePrimaryAgenda: async (db: unknown, tenantId: string, select: unknown) => {
    const agenda = (await mocks.findAgenda(db, tenantId, select)) as { id: string; professionalId: number } | null;
    if (!agenda) throw new mocks.TenantScopeError("tenant_scope:tenant_scope_missing");
    return { scope: { tenantId, agendaId: agenda.id }, professionalId: agenda.professionalId, professional: {} };
  },
}));
// decideTenantAccess real, salvo en los casos de soporte (025d todavía no lo implementa en core).
vi.mock("@nutri-bot/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nutri-bot/core")>();
  return {
    ...actual,
    decideTenantAccess: (...args: Parameters<typeof actual.decideTenantAccess>) =>
      (mocks.decide ? mocks.decide(...args) : actual.decideTenantAccess(...args)),
  };
});

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
    mocks.loadOnboardedClinic.mockResolvedValue(null);
    mocks.getTenantSubscriptionGate.mockResolvedValue("pending");
    mocks.findAgenda.mockResolvedValue(legacyAgenda);
  });

  it("el candado transitorio es solo el consultorio original", () => {
    expect(ENABLED_TENANT_IDS).toEqual(["legacy-tenant"]);
  });

  it("miembro OWNER del consultorio original → contexto con su agenda principal", async () => {
    expect(await getTenantAccess()).toEqual({ ok: true, ctx: ownerCtx });
    expect(mocks.loadAccessFacts).toHaveBeenCalledWith("user-a", expect.any(Date));
    expect(mocks.findAgenda).toHaveBeenCalledWith(fakePrisma, "legacy-tenant", { id: true });
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
    mocks.loadOnboardedClinic.mockResolvedValue(null);
    mocks.getTenantSubscriptionGate.mockResolvedValue("pending");
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

// HU-025b-2 (M10): casos reubicados de private-content-access.test.ts (se borró el wrapper).
describe("contexto para recetas y plantillas (antes resolvePrivateContentAccess)", () => {
  const support = (mode: "READ_ONLY" | "READ_WRITE") => ({
    ok: true,
    grant: { kind: "support", tenantId: "legacy-tenant", grantId: "g", mode, expiresAt: new Date("2030-01-01") },
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decide = null;
    mocks.auth.mockResolvedValue({ ...session, userId: "operator" });
    mocks.loadAccessFacts.mockResolvedValue(facts([]));
    mocks.findAgenda.mockResolvedValue(legacyAgenda);
  });

  it("soporte de solo lectura (025d): lee, no escribe y nunca es OWNER", async () => {
    mocks.decide = () => support("READ_ONLY");
    expect((await requireTenantContext("read")).access).toMatchObject({ kind: "support", mode: "READ_ONLY" });
    expect(await codeOf(() => requireTenantContext("write"))).toBe("read_only");
    expect(await codeOf(() => requireTenantContext())).toBe("read_only"); // default "write"
    expect(await codeOf(() => requireOwnerContext())).toBe("owner_only");
  });

  it("soporte con permiso para editar (025d): lee y escribe, pero Equipo sigue vedado", async () => {
    mocks.decide = () => support("READ_WRITE");
    expect((await requireTenantContext("write")).tenantId).toBe("legacy-tenant");
    expect(await codeOf(() => requireOwnerContext())).toBe("owner_only");
  });

  it("revalida en cada operación: membresía revocada sin sesión nueva → sin contexto", async () => {
    mocks.loadAccessFacts
      .mockResolvedValueOnce(facts([{ tenantId: "legacy-tenant", role: "STAFF" }]))
      .mockResolvedValueOnce(facts([]));
    expect((await requireTenantContext("write")).access).toMatchObject({ kind: "member", role: "STAFF" });
    expect(await codeOf(() => requireTenantContext("write"))).toBe("no_context");
  });
});

describe("HU-026: consultorios nuevos con política de onboarding y suscripción", () => {
  const newAgenda = { id: "new-agenda", professionalId: 7 };
  const newOwnerCtx = {
    userId: "user-a",
    tenantId: "clinic-new",
    agendaId: "new-agenda",
    professionalId: 7,
    access: { kind: "member", tenantId: "clinic-new", role: "OWNER" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decide = null;
    mocks.auth.mockResolvedValue(session);
    mocks.loadAccessFacts.mockResolvedValue(facts([{ tenantId: "clinic-new", role: "OWNER" }]));
    mocks.loadOnboardedClinic.mockResolvedValue({ name: "Consultorio Nuevo", setupComplete: true });
    mocks.getTenantSubscriptionGate.mockResolvedValue("pending");
    mocks.findAgenda.mockResolvedValue(newAgenda);
  });

  it.each(["not_required", "verified"] as const)("habilita operación con suscripción %s cuando el alta está completa", async (gate) => {
    mocks.getTenantSubscriptionGate.mockResolvedValue(gate);
    expect(await getTenantAccess()).toEqual({ ok: true, ctx: newOwnerCtx });
    expect(await requireTenantContext("write")).toEqual(newOwnerCtx);
    expect(await requireOwnerContext()).toEqual(newOwnerCtx);
    expect(mocks.getTenantSubscriptionGate).toHaveBeenCalledWith("clinic-new");
  });

  it.each(["pending", "error"] as const)("titular con suscripción %s no puede operar ni obtener contexto", async (state) => {
    if (state === "error") mocks.getTenantSubscriptionGate.mockRejectedValue(new Error("boom"));
    expect(await getTenantAccess()).toEqual({
      ok: false,
      reason: "onboarding_pending",
      clinicName: "Consultorio Nuevo",
      email: "ana@example.test",
    });
    expect(await getTenantContext()).toBeNull();
    expect(await codeOf(() => requireTenantContext("write"))).toBe("no_context");
    expect(await codeOf(() => requireOwnerContext())).toBe("no_context");
    await expect(requirePageContext()).rejects.toMatchObject({ url: "/inicio" });
    expect(mocks.findAgenda).not.toHaveBeenCalled();
  });

  it("alta incompleta (sin agenda principal) vuelve a setup y bloquea operación aun con gate verified", async () => {
    mocks.loadOnboardedClinic.mockResolvedValue({ name: "Consultorio Nuevo", timeZone: "America/Montevideo", setupComplete: false });
    mocks.getTenantSubscriptionGate.mockResolvedValue("verified");
    expect(await getTenantAccess()).toEqual({
      ok: false,
      reason: "onboarding_setup",
      clinicName: "Consultorio Nuevo",
      timeZone: "America/Montevideo",
      email: "ana@example.test",
    });
    expect(await codeOf(() => requireTenantContext("write"))).toBe("no_context");
    expect(mocks.getTenantSubscriptionGate).not.toHaveBeenCalled();
  });

  it("STAFF de consultorio nuevo con suscripción pendiente recibe tenant_not_enabled sin contexto", async () => {
    mocks.loadAccessFacts.mockResolvedValue(facts([{ tenantId: "clinic-new", role: "STAFF" }]));
    expect(await getTenantAccess()).toEqual({ ok: false, reason: "tenant_not_enabled", email: "ana@example.test" });
    expect(await codeOf(() => requireTenantContext("read"))).toBe("no_context");
  });

  it("consultorio existente no consulta perfil de onboarding ni suscripción", async () => {
    mocks.loadAccessFacts.mockResolvedValue(facts([{ tenantId: "legacy-tenant", role: "OWNER" }]));
    mocks.findAgenda.mockResolvedValue(legacyAgenda);
    expect(await getTenantAccess()).toEqual({ ok: true, ctx: ownerCtx });
    expect(mocks.loadOnboardedClinic).not.toHaveBeenCalled();
    expect(mocks.getTenantSubscriptionGate).not.toHaveBeenCalled();
  });
});
