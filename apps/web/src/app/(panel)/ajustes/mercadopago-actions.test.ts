// HU-023 / HU-028a: server actions de Mercado Pago en Ajustes (sin base ni red). Solo el OWNER (D4b).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
    requireTenantContext: vi.fn(),
    requireOwnerContext: vi.fn(),
    TenantAccessError: class TenantAccessError extends Error {
      constructor(readonly code: string) { super(code); }
    },
  };
});
vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: mocks.requireTenantContext,
  requireOwnerContext: mocks.requireOwnerContext,
  TenantAccessError: mocks.TenantAccessError,
}));
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

const OWNER_CTX = { userId: "u-owner", tenantId: "legacy-tenant", access: { kind: "member", role: "OWNER" } };

describe("connectMercadoPagoAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnerContext.mockResolvedValue(OWNER_CTX);
  });

  it.each(["no_context", "owner_only"])("sin contexto de OWNER (%s) → /inicio, sin iniciar el OAuth", async (code) => {
    mocks.requireOwnerContext.mockRejectedValue(new mocks.TenantAccessError(code));
    expect(await redirectedTo(connectMercadoPagoAction)).toBe("/inicio");
    expect(mocks.requireOwnerContext).toHaveBeenCalledTimes(1);
    expect(mocks.requireTenantContext).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("un error que no es de acceso se propaga sin iniciar el OAuth", async () => {
    mocks.requireOwnerContext.mockRejectedValue(new Error("db down"));
    await expect(connectMercadoPagoAction()).rejects.toThrow("db down");
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("falta configuración → Ajustes con mp=not_configured", async () => {
    mocks.start.mockRejectedValue(new mocks.MercadoPagoConfigError("x"));
    expect(await redirectedTo(connectMercadoPagoAction)).toBe("/ajustes?tab=mercadopago&mp=not_configured");
  });

  it("OK → state atado al userId del OWNER (sin email) y redirige a Mercado Pago", async () => {
    mocks.start.mockResolvedValue({ url: "https://auth.mercadopago.com/authorization?client_id=1" });
    expect(await redirectedTo(connectMercadoPagoAction)).toBe("https://auth.mercadopago.com/authorization?client_id=1");
    expect(mocks.start).toHaveBeenCalledWith(OWNER_CTX, { userId: "u-owner" });
    expect(mocks.auth).not.toHaveBeenCalled();
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
    mocks.requireOwnerContext.mockResolvedValue(OWNER_CTX);
  });

  it("desconecta la cuenta del consultorio del contexto y revalida Ajustes y Servicios", async () => {
    mocks.disconnect.mockResolvedValue({ cancelledDeposits: 1 });
    await disconnectMercadoPagoAction();
    expect(mocks.requireOwnerContext).toHaveBeenCalledTimes(1);
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
    expect(mocks.disconnect).toHaveBeenCalledWith(OWNER_CTX);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ajustes");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/servicios");
  });

  it.each(["no_context", "owner_only"])("sin contexto de OWNER (%s) no desconecta", async (code) => {
    mocks.requireOwnerContext.mockRejectedValue(new mocks.TenantAccessError(code));
    expect(await redirectedTo(disconnectMercadoPagoAction)).toBe("/inicio");
    expect(mocks.disconnect).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("D4b fijado en el código (HU-028a)", () => {
  const source = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");
  /** Cuerpo de `export async function <name>` hasta la próxima función exportada. */
  const fn = (text: string, name: string) => {
    const start = text.indexOf(`export async function ${name}(`);
    expect(start).toBeGreaterThanOrEqual(0);
    const next = text.indexOf("\nexport ", start + 1);
    return text.slice(start, next < 0 ? undefined : next);
  };

  it.each(["connectMercadoPagoAction", "disconnectMercadoPagoAction"])("%s usa requireOwnerContext", (name) => {
    const body = fn(source("./actions.ts"), name);
    expect(body).toContain("requireOwnerContext(");
    expect(body).not.toContain("requireTenantContext(");
  });

  it("el callback del OAuth usa requireOwnerContext", () => {
    const route = source("../../api/mercadopago/oauth/callback/route.ts");
    expect(route).toContain("requireOwnerContext(");
    expect(route).not.toContain("requireTenantContext(");
  });
});
