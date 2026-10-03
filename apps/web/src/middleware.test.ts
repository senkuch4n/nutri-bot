import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ default: () => ({ auth: vi.fn() }) }));
vi.mock("./auth.config", () => ({ authConfig: {} }));
import { config } from "./middleware";

describe("public Mercado Pago webhook matcher", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);
  it("excludes the exact webhook", () => {
    expect(matcher.test("/api/webhooks/mercadopago")).toBe(false);
  });
  it("serves the Numa logo without authentication", () => {
    expect(matcher.test("/numa-logo.png")).toBe(false);
    expect(matcher.test("/numa-logo.png/private")).toBe(true);
  });
  it.each(["/api/webhooks/other", "/api/webhooks/mercadopago-private", "/api/webhooks/mercadopago/other", "/agenda"])("keeps %s protected", (pathname) => {
    expect(matcher.test(pathname)).toBe(true);
  });
});
