import { describe, expect, it } from "vitest";
import { assertCaptureDirOutsideRepo, assertSandboxEnv, assertSandboxSeller } from "./mp-sandbox-guard";

describe("assertSandboxSeller", () => {
  it("accepts a Mercado Pago test user", () => {
    expect(() => assertSandboxSeller({ id: 1, tags: ["normal", "test_user"] })).not.toThrow();
  });

  it("throws when /users/me has no test_user tag", () => {
    expect(() => assertSandboxSeller({ id: 1, tags: ["normal"] })).toThrow(/test_user/);
  });

  it("throws (fail closed) when tags are missing or the response is not an object", () => {
    expect(() => assertSandboxSeller({ id: 1 })).toThrow(/test_user/);
    expect(() => assertSandboxSeller({ id: 1, tags: "test_user" })).toThrow(/test_user/);
    expect(() => assertSandboxSeller(null)).toThrow(/test_user/);
    expect(() => assertSandboxSeller("test_user")).toThrow(/test_user/);
  });
});

describe("assertSandboxEnv", () => {
  it("accepts MP_SUBS_SANDBOX=true outside production", () => {
    expect(() => assertSandboxEnv({ MP_SUBS_SANDBOX: "true", NODE_ENV: "development" })).not.toThrow();
    expect(() => assertSandboxEnv({ MP_SUBS_SANDBOX: "true" })).not.toThrow();
  });

  it("throws when MP_SUBS_SANDBOX is not exactly \"true\"", () => {
    expect(() => assertSandboxEnv({})).toThrow(/MP_SUBS_SANDBOX/);
    expect(() => assertSandboxEnv({ MP_SUBS_SANDBOX: "1" })).toThrow(/MP_SUBS_SANDBOX/);
    expect(() => assertSandboxEnv({ MP_SUBS_SANDBOX: "TRUE" })).toThrow(/MP_SUBS_SANDBOX/);
  });

  it("throws with NODE_ENV=production", () => {
    expect(() => assertSandboxEnv({ MP_SUBS_SANDBOX: "true", NODE_ENV: "production" })).toThrow(/production/);
  });
});

describe("assertCaptureDirOutsideRepo", () => {
  it("accepts a directory outside the repository", () => {
    expect(() => assertCaptureDirOutsideRepo("/tmp/numa-mp", "/Users/x/Nutri-Bot")).not.toThrow();
    expect(() => assertCaptureDirOutsideRepo("/Users/x/Nutri-Bot-captures", "/Users/x/Nutri-Bot")).not.toThrow();
  });

  it("throws when the directory is the repository or inside it", () => {
    expect(() => assertCaptureDirOutsideRepo("/Users/x/Nutri-Bot", "/Users/x/Nutri-Bot")).toThrow(/fuera del repo/);
    expect(() => assertCaptureDirOutsideRepo("/Users/x/Nutri-Bot/tmp/caps", "/Users/x/Nutri-Bot")).toThrow(/fuera del repo/);
  });
});
