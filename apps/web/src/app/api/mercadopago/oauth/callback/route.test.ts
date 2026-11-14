// HU-023: callback del OAuth de Mercado Pago, sin base ni red.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  complete: vi.fn(),
  revalidatePath: vi.fn(),
  allowedEmails: ["pro@example.test"],
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/auth.config", () => ({ allowedEmails: mocks.allowedEmails }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db/domain", () => ({ completeMercadoPagoOAuth: mocks.complete }));

import { GET } from "./route";

const CALLBACK = "http://internal:3000/api/mercadopago/oauth/callback?code=TG-code&state=st";

describe("GET /api/mercadopago/oauth/callback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("AUTH_URL", "https://panel.example.test");
    mocks.auth.mockResolvedValue({ user: { email: "Pro@Example.test" } });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sin sesión → /inicio sin completar el OAuth", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await GET(new Request(CALLBACK));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://panel.example.test/inicio");
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("email fuera de ALLOWED_EMAILS → /inicio sin completar el OAuth", async () => {
    mocks.auth.mockResolvedValue({ user: { email: "otra@example.test" } });
    const res = await GET(new Request(CALLBACK));
    expect(res.headers.get("location")).toBe("https://panel.example.test/inicio");
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it.each(["connected", "denied", "invalid_state", "rejected", "not_configured", "wrong_environment"])(
    "%s → 303 a Ajustes con el resultado, sobre AUTH_URL",
    async (result) => {
      mocks.complete.mockResolvedValue(result);
      const res = await GET(new Request(CALLBACK));
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe(`https://panel.example.test/ajustes?tab=mercadopago&mp=${result}`);
      const arg = mocks.complete.mock.calls[0]![0];
      expect(arg.sessionEmail).toBe("pro@example.test");
      expect(arg.query.get("code")).toBe("TG-code");
      expect(arg.query.get("state")).toBe("st");
      if (result === "connected") {
        expect(mocks.revalidatePath).toHaveBeenCalledWith("/ajustes");
        expect(mocks.revalidatePath).toHaveBeenCalledWith("/servicios");
      } else {
        expect(mocks.revalidatePath).not.toHaveBeenCalled();
      }
    },
  );

  it("sin AUTH_URL usa la URL del request", async () => {
    vi.stubEnv("AUTH_URL", "");
    mocks.complete.mockResolvedValue("denied");
    const res = await GET(new Request(CALLBACK));
    expect(res.headers.get("location")).toBe("http://internal:3000/ajustes?tab=mercadopago&mp=denied");
  });
});
