// HU-023 / HU-028a: callback del OAuth de Mercado Pago, sin base ni red. Solo el OWNER (D4b).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  revalidatePath: vi.fn(),
  requireTenantContext: vi.fn(),
  requireOwnerContext: vi.fn(),
  TenantAccessError: class TenantAccessError extends Error {
    constructor(readonly code: string) { super(code); }
  },
}));
vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: mocks.requireTenantContext,
  requireOwnerContext: mocks.requireOwnerContext,
  TenantAccessError: mocks.TenantAccessError,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db/domain", () => ({ completeMercadoPagoOAuth: mocks.complete }));

import { GET } from "./route";

const CALLBACK = "http://internal:3000/api/mercadopago/oauth/callback?code=TG-code&state=st";

describe("GET /api/mercadopago/oauth/callback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("AUTH_URL", "https://panel.example.test");
    mocks.requireOwnerContext.mockResolvedValue({ userId: "u", tenantId: "legacy-tenant" });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sin contexto de consultorio (sin sesión, sin membresía, revocada) → /inicio sin completar el OAuth", async () => {
    mocks.requireOwnerContext.mockRejectedValue(new mocks.TenantAccessError("no_context"));
    const res = await GET(new Request(CALLBACK));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://panel.example.test/inicio");
    expect(mocks.requireOwnerContext).toHaveBeenCalledTimes(1);
    expect(mocks.requireTenantContext).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("HU-028a: un miembro que no es OWNER → invalid_state, sin canjear ni consumir el state", async () => {
    mocks.requireOwnerContext.mockRejectedValue(new mocks.TenantAccessError("owner_only"));
    const res = await GET(new Request(CALLBACK));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://panel.example.test/ajustes?tab=mercadopago&mp=invalid_state");
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("un error que no es de acceso no se disfraza de redirect", async () => {
    mocks.requireOwnerContext.mockRejectedValue(new Error("db down"));
    await expect(GET(new Request(CALLBACK))).rejects.toThrow("db down");
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it.each(["connected", "denied", "invalid_state", "rejected", "not_configured", "wrong_environment", "account_in_use"])(
    "%s → 303 a Ajustes con el resultado, sobre AUTH_URL",
    async (result) => {
      mocks.complete.mockResolvedValue(result);
      const res = await GET(new Request(CALLBACK));
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe(`https://panel.example.test/ajustes?tab=mercadopago&mp=${result}`);
      // HU-025: el consultorio es el del contexto, nunca del query.
      expect(mocks.complete.mock.calls[0]![0]).toEqual({ userId: "u", tenantId: "legacy-tenant" });
      const arg = mocks.complete.mock.calls[0]![1];
      // HU-028a: el state se ata al userId de la sesión, no al email.
      expect(arg.userId).toBe("u");
      expect(arg).not.toHaveProperty("sessionEmail");
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

  it("una excepción del callback se traduce a rejected sin exponer detalles ni revalidar", async () => {
    mocks.complete.mockRejectedValue(new Error("provider detail TG-code"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await GET(new Request(CALLBACK));
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe("https://panel.example.test/ajustes?tab=mercadopago&mp=rejected");
      expect(await res.text()).toBe("");
      expect(log.mock.calls).toEqual([["[mercadopago] oauth_callback_failed"]]);
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("sin AUTH_URL usa la URL del request", async () => {
    vi.stubEnv("AUTH_URL", "");
    mocks.complete.mockResolvedValue("denied");
    const res = await GET(new Request(CALLBACK));
    expect(res.headers.get("location")).toBe("http://internal:3000/ajustes?tab=mercadopago&mp=denied");
  });
});
