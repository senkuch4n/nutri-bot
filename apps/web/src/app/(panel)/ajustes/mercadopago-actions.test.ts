// HU-023: server actions de Mercado Pago en Ajustes (sin base ni red).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MercadoPagoConfigError extends Error {}
  return {
    auth: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { url });
    }),
    revalidatePath: vi.fn(),
    start: vi.fn(),
    disconnect: vi.fn(),
    MercadoPagoConfigError,
  };
});
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db", () => ({ prisma: {} }));
vi.mock("@/lib/bot-ai", () => ({ getBotAiKeyStatus: vi.fn() }));
vi.mock("@nutri-bot/db/domain", () => ({
  startMercadoPagoOAuth: mocks.start,
  disconnectMercadoPagoAccount: mocks.disconnect,
  MercadoPagoConfigError: mocks.MercadoPagoConfigError,
}));

import { connectMercadoPagoAction, disconnectMercadoPagoAction } from "./actions";

async function redirectedTo(run: () => Promise<unknown>): Promise<string> {
  const error = await run().then(
    () => null,
    (e: unknown) => e,
  );
  return (error as { url: string }).url;
}

describe("connectMercadoPagoAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { email: "pro@example.test" } });
  });

  it("sin sesión → /inicio, sin iniciar el OAuth", async () => {
    mocks.auth.mockResolvedValue(null);
    expect(await redirectedTo(connectMercadoPagoAction)).toBe("/inicio");
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("falta configuración → Ajustes con mp=not_configured", async () => {
    mocks.start.mockRejectedValue(new mocks.MercadoPagoConfigError("x"));
    expect(await redirectedTo(connectMercadoPagoAction)).toBe("/ajustes?tab=mercadopago&mp=not_configured");
  });

  it("OK → redirige a la URL de autorización de Mercado Pago", async () => {
    mocks.start.mockResolvedValue({ url: "https://auth.mercadopago.com/authorization?client_id=1" });
    expect(await redirectedTo(connectMercadoPagoAction)).toBe("https://auth.mercadopago.com/authorization?client_id=1");
    expect(mocks.start).toHaveBeenCalledWith("pro@example.test");
  });

  it("otro error no se disfraza de configuración", async () => {
    mocks.start.mockRejectedValue(new Error("db down"));
    await expect(connectMercadoPagoAction()).rejects.toThrow("db down");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("disconnectMercadoPagoAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { email: "pro@example.test" } });
  });

  it("desconecta y revalida Ajustes y Servicios", async () => {
    mocks.disconnect.mockResolvedValue({ cancelledDeposits: 1 });
    await disconnectMercadoPagoAction();
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ajustes");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/servicios");
  });

  it("sin sesión no desconecta", async () => {
    mocks.auth.mockResolvedValue(null);
    expect(await redirectedTo(disconnectMercadoPagoAction)).toBe("/inicio");
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });
});
