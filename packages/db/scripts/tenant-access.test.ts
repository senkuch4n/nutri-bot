import { describe, expect, it } from "vitest";
import { maskSubject, parseArgs, USAGE } from "./tenant-access";

const fails = (argv: string[], message: string) => expect(() => parseArgs(argv)).toThrow(message);

describe("parseArgs", () => {
  it("help", () => expect(parseArgs(["--help"])).toEqual({ name: "help" }));

  it("pending sin opciones", () => expect(parseArgs(["pending"])).toEqual({ name: "pending" }));

  it("members con tenant", () =>
    expect(parseArgs(["members", "--tenant", "legacy-tenant"])).toEqual({ name: "members", tenantId: "legacy-tenant" }));

  it("grant canonicaliza el email y es dry-run por defecto", () =>
    expect(parseArgs(["grant", "--email", " Daiana@Example.TEST ", "--tenant", "legacy-tenant", "--role", "OWNER"]))
      .toEqual({ name: "grant", email: "daiana@example.test", tenantId: "legacy-tenant", role: "OWNER", apply: false }));

  it("grant con --apply en cualquier posición", () =>
    expect(parseArgs(["grant", "--apply", "--role", "STAFF", "--tenant", "t1", "--email", "a@b.test"]))
      .toEqual({ name: "grant", email: "a@b.test", tenantId: "t1", role: "STAFF", apply: true }));

  it("revoke y forget-pending", () => {
    expect(parseArgs(["revoke", "--email", "a@b.test", "--tenant", "t1", "--apply"]))
      .toEqual({ name: "revoke", email: "a@b.test", tenantId: "t1", apply: true });
    expect(parseArgs(["forget-pending", "--email", "a@b.test"]))
      .toEqual({ name: "forget-pending", email: "a@b.test", apply: false });
  });

  it.each([
    [[]],
    [["desconocido"]],
    [["pending", "--apply"]],
    [["members"]],
    [["members", "--tenant"]],
    [["members", "--tenant", "--apply"]],
    [["members", "--tenant", "a", "--tenant", "b"]],
    [["grant", "--email", "a@b.test", "--tenant", "t1"]],
    [["grant", "--email", "a@b.test", "--tenant", "t1", "--role", "OWNER", "--apply", "--apply"]],
    [["grant", "--email", "a@b.test", "--tenant", "t1", "--role", "OWNER", "--extra", "x"]],
    [["forget-pending", "--email", "a@b.test", "--tenant", "t1"]],
    [["--help", "pending"]],
  ])("rechaza con el uso: %j", (argv) => fails(argv, USAGE));

  it.each(["no-arroba", "a@b", "a b@c.test", "a@b.test\n"])("rechaza email inválido %j", (email) =>
    fails(["forget-pending", "--email", email.replace("\n", "\nx")], "Invalid email."));

  it.each(["con espacio", "a.b", "x".repeat(65), ""])("rechaza tenant inválido %j", (tenant) =>
    fails(["members", "--tenant", tenant], "Invalid tenant id."));

  it.each(["owner", "ADMIN", ""])("rechaza rol inválido %j", (role) =>
    fails(["grant", "--email", "a@b.test", "--tenant", "t1", "--role", role], "Invalid role."));
});

describe("maskSubject", () => {
  it("muestra solo los últimos 4", () => expect(maskSubject("108234567890123451234")).toBe("…1234"));
  it("un sub corto no se muestra", () => expect(maskSubject("12345678")).toBe("…"));
  it("sin sub", () => expect(maskSubject(null)).toBe("-"));
});
