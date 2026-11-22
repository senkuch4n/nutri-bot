import { describe, expect, it } from "vitest";
import { canonicalEmail, decideTenantAccess, type AccessFacts } from "./tenant-access";

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
