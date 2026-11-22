import { describe, expect, it } from "vitest";
import { canRemoveMember, canonicalEmail, decideTenantAccess, isMutatingPanelRequest, type AccessFacts } from "./tenant-access";

const facts = (over: Partial<AccessFacts> = {}): AccessFacts => ({
  linked: true,
  memberships: [],
  platformOperator: false,
  activeSupportGrants: [],
  ...over,
});

describe("canonicalEmail", () => {
  it("recorta espacios y pasa a minúsculas", () => {
    expect(canonicalEmail(" Ana@Example.COM ")).toBe("ana@example.com");
  });
  it("recorta tabs y saltos de línea", () => {
    expect(canonicalEmail("\tBeto@Mail.com\n")).toBe("beto@mail.com");
  });
  it("es idempotente", () => {
    const once = canonicalEmail("  MiXto@Dominio.Ar ");
    expect(canonicalEmail(once)).toBe(once);
  });
  it("no toca un email ya canónico", () => {
    expect(canonicalEmail("ok@example.test")).toBe("ok@example.test");
  });
});

describe("decideTenantAccess", () => {
  it("sin User → unlinked", () => {
    expect(decideTenantAccess(null)).toEqual({ ok: false, reason: "unlinked" });
  });

  it("User sin googleSubject → unlinked aunque tenga membresía", () => {
    expect(decideTenantAccess(facts({ linked: false, memberships: [{ tenantId: "t1", role: "OWNER" }] })))
      .toEqual({ ok: false, reason: "unlinked" });
  });

  it("0 membresías sin operador → no_membership (identidad pendiente)", () => {
    expect(decideTenantAccess(facts())).toEqual({ ok: false, reason: "no_membership" });
  });

  it.each(["OWNER", "STAFF"] as const)("1 membresía %s → member con su tenant y rol", (role) => {
    expect(decideTenantAccess(facts({ memberships: [{ tenantId: "legacy-tenant", role }] }))).toEqual({
      ok: true,
      grant: { kind: "member", tenantId: "legacy-tenant", role },
    });
  });

  it("2 membresías → multiple_memberships (D7)", () => {
    expect(decideTenantAccess(facts({
      memberships: [{ tenantId: "a", role: "OWNER" }, { tenantId: "b", role: "STAFF" }],
    }))).toEqual({ ok: false, reason: "multiple_memberships" });
  });

  it("2 membresías → multiple_memberships aunque una esté fuera del candado", () => {
    expect(decideTenantAccess(facts({
      memberships: [{ tenantId: "legacy-tenant", role: "OWNER" }, { tenantId: "b", role: "STAFF" }],
    }), { enabledTenantIds: ["legacy-tenant"] })).toEqual({ ok: false, reason: "multiple_memberships" });
  });

  it("membresía en tenant fuera de enabledTenantIds → tenant_not_enabled", () => {
    expect(decideTenantAccess(facts({ memberships: [{ tenantId: "otro", role: "OWNER" }] }), {
      enabledTenantIds: ["legacy-tenant"],
    })).toEqual({ ok: false, reason: "tenant_not_enabled" });
  });

  it("membresía en tenant habilitado → member", () => {
    expect(decideTenantAccess(facts({ memberships: [{ tenantId: "legacy-tenant", role: "STAFF" }] }), {
      enabledTenantIds: ["legacy-tenant"],
    })).toEqual({ ok: true, grant: { kind: "member", tenantId: "legacy-tenant", role: "STAFF" } });
  });

  it("candado vacío → ningún tenant entra", () => {
    expect(decideTenantAccess(facts({ memberships: [{ tenantId: "legacy-tenant", role: "OWNER" }] }), {
      enabledTenantIds: [],
    })).toEqual({ ok: false, reason: "tenant_not_enabled" });
  });

  it("sin enabledTenantIds → cualquier tenant ok", () => {
    expect(decideTenantAccess(facts({ memberships: [{ tenantId: "cualquiera", role: "OWNER" }] }))).toEqual({
      ok: true,
      grant: { kind: "member", tenantId: "cualquiera", role: "OWNER" },
    });
  });

  it("rol desconocido desde la base → sin acceso", () => {
    const odd = facts({ memberships: [{ tenantId: "t", role: "ADMIN" as never }] });
    expect(decideTenantAccess(odd)).toEqual({ ok: false, reason: "no_membership" });
  });

  it("025a: hechos de plataforma sin membresía no dan acceso (falla cerrado)", () => {
    expect(decideTenantAccess(facts({
      platformOperator: true,
      activeSupportGrants: [{ id: "g", tenantId: "legacy-tenant", mode: "READ_WRITE", expiresAt: new Date() }],
    }))).toEqual({ ok: false, reason: "no_membership" });
  });

  it("membresía + permiso de soporte → manda la membresía", () => {
    expect(decideTenantAccess(facts({
      memberships: [{ tenantId: "legacy-tenant", role: "STAFF" }],
      platformOperator: true,
      activeSupportGrants: [{ id: "g", tenantId: "otro", mode: "READ_WRITE", expiresAt: new Date() }],
    }))).toEqual({ ok: true, grant: { kind: "member", tenantId: "legacy-tenant", role: "STAFF" } });
  });
});

describe("isMutatingPanelRequest", () => {
  const req = (method: string, pathname: string, isServerAction = false) => ({ method, pathname, isServerAction });

  it.each([
    ["GET página", req("GET", "/pacientes"), false],
    ["HEAD", req("HEAD", "/pacientes"), false],
    ["GET /api/slots", req("GET", "/api/slots"), false],
    ["get en minúsculas", req("get", "/turnos"), false],
    ["POST con server action", req("POST", "/pacientes", true), true],
    ["GET con server action", req("GET", "/pacientes", true), true],
    ["POST a la API", req("POST", "/api/appointments"), true],
    ["PUT a la API", req("PUT", "/api/professional/logo"), true],
    ["DELETE a la API", req("DELETE", "/api/professional/signature"), true],
    ["PATCH", req("PATCH", "/api/appointments"), true],
    ["GET al callback de MP (escribe)", req("GET", "/api/mercadopago/oauth/callback"), true],
    ["GET al callback de MP con barra final", req("GET", "/api/mercadopago/oauth/callback/"), true],
    ["GET a un prefijo del callback no cuenta", req("GET", "/api/mercadopago/oauth"), false],
  ])("%s → %s", (_name, r, expected) => {
    expect(isMutatingPanelRequest(r)).toBe(expected);
  });
});

describe("canRemoveMember (7.2.1)", () => {
  const owner = { userId: "u-owner", role: "OWNER" as const };
  it.each([
    ["actor STAFF → not_owner", { actor: { userId: "u-staff", role: "STAFF" as const }, target: { userId: "u-x", role: "STAFF" as const }, ownerCount: 1 }, { ok: false, reason: "not_owner" }],
    ["actor soporte (role null) → not_owner", { actor: { userId: "op", role: null }, target: { userId: "u-x", role: "STAFF" as const }, ownerCount: 1 }, { ok: false, reason: "not_owner" }],
    ["target null (otro consultorio o inventado) → not_member", { actor: owner, target: null, ownerCount: 1 }, { ok: false, reason: "not_member" }],
    ["target = actor → self", { actor: owner, target: { userId: "u-owner", role: "OWNER" as const }, ownerCount: 2 }, { ok: false, reason: "self" }],
    ["target OWNER con ownerCount 1 → last_owner", { actor: owner, target: { userId: "u-other", role: "OWNER" as const }, ownerCount: 1 }, { ok: false, reason: "last_owner" }],
    ["target OWNER con 2 → ok (C5)", { actor: owner, target: { userId: "u-other", role: "OWNER" as const }, ownerCount: 2 }, { ok: true }],
    ["target STAFF → ok", { actor: owner, target: { userId: "u-staff", role: "STAFF" as const }, ownerCount: 1 }, { ok: true }],
  ] as const)("%s", (_name, input, expected) => {
    expect(canRemoveMember(input)).toEqual(expected);
  });

  it("not_owner gana sobre cualquier otra regla (soporte nunca quita, ni a sí mismo)", () => {
    expect(canRemoveMember({ actor: { userId: "op", role: null }, target: null, ownerCount: 0 })).toEqual({ ok: false, reason: "not_owner" });
  });
});
