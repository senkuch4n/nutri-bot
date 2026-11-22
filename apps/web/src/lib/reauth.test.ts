// HU-025 (M12): estado `reauth` de las server actions sin contexto.
import { describe, expect, it } from "vitest";
import { isTenantAccessError, withReauth } from "./reauth";

class TenantAccessError extends Error {
  constructor(code: string) {
    super(`tenant_access:${code}`);
    this.name = "TenantAccessError";
  }
}

describe("withReauth", () => {
  it("un TenantAccessError agrega reauth al estado de error", () => {
    expect(isTenantAccessError(new TenantAccessError("no_context"))).toBe(true);
    expect(withReauth(new TenantAccessError("no_context"), { ok: false, error: "x" })).toEqual({ ok: false, error: "x", reauth: true });
  });
  it("cualquier otro error deja el estado igual", () => {
    expect(isTenantAccessError(new Error("db down"))).toBe(false);
    expect(isTenantAccessError("tenant_access")).toBe(false);
    expect(withReauth(new Error("db down"), { ok: false, error: "x" })).toEqual({ ok: false, error: "x" });
  });
});
