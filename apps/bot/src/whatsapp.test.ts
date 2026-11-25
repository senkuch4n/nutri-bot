// HU-025b2: registrar el estado del bot (BotStatus) nunca corta la conexión ni la reconexión.
// Baileys, la base y el tenant están mockeados: no hay WhatsApp real ni Postgres.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: {} as Record<string, (u: unknown) => Promise<void>>,
  makeWASocket: vi.fn(),
  upsert: vi.fn(),
  tenant: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@whiskeysockets/baileys", () => ({
  default: mocks.makeWASocket,
  DisconnectReason: { loggedOut: 401 },
  fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] }),
  normalizeMessageContent: (m: unknown) => m,
  useMultiFileAuthState: async () => ({ state: {}, saveCreds: vi.fn() }),
}));
vi.mock("pino", () => ({ default: () => ({}) }));
vi.mock("qrcode-terminal", () => ({ default: { generate: vi.fn() } }));
vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64,qr" } }));
vi.mock("@nutri-bot/db", () => ({ prisma: { botStatus: { upsert: mocks.upsert } } }));
vi.mock("./env", () => ({ env: { authDir: "/tmp/no-se-usa" } }));
vi.mock("./logger", () => ({ logger: { warn: mocks.warn, info: mocks.info, error: mocks.error, debug: vi.fn() } }));
vi.mock("./tenant", () => ({ getConversationTenant: mocks.tenant }));

import { startWhatsApp } from "./whatsapp";

const close = { connection: "close", lastDisconnect: { error: { output: { statusCode: 500 } } } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  mocks.handlers = {};
  mocks.makeWASocket.mockImplementation(() => ({
    ev: { on: (event: string, fn: (u: unknown) => Promise<void>) => { mocks.handlers[event] = fn; } },
  }));
  mocks.tenant.mockResolvedValue({ tenantId: "legacy-tenant" });
  mocks.upsert.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

async function connectionUpdate(u: unknown) {
  await mocks.handlers["connection.update"]!(u);
}

describe("estado del bot en connection.update", () => {
  it("con la base sana, escribe la fila del tenant y reconecta a los 3 s", async () => {
    await startWhatsApp(vi.fn());
    await connectionUpdate(close);
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { tenantId: "legacy-tenant" },
      create: { tenantId: "legacy-tenant", connected: false },
      update: { connected: false },
    });
    expect(mocks.warn).toHaveBeenCalledTimes(1); // solo el aviso de reconexión
    await vi.advanceTimersByTimeAsync(3000);
    expect(mocks.makeWASocket).toHaveBeenCalledTimes(2);
  });

  it("si falla el alta (fila ajena: P2002), la reconexión sigue y el log lleva solo el código", async () => {
    const err = Object.assign(new Error("Unique constraint failed on legacy-tenant 5491100000000"), { code: "P2002" });
    mocks.upsert.mockRejectedValue(err);
    await startWhatsApp(vi.fn());
    await expect(connectionUpdate(close)).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalledWith({ code: "P2002", connected: false }, "No se pudo registrar el estado del bot");
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toMatch(/549110|legacy-tenant|Unique constraint/);
    await vi.advanceTimersByTimeAsync(3000);
    expect(mocks.makeWASocket).toHaveBeenCalledTimes(2);
  });

  it("si no se puede resolver el consultorio, no escribe, loguea el código y la reconexión sigue", async () => {
    mocks.tenant.mockRejectedValue(Object.assign(new Error("tenant x sin agenda"), { name: "TenantScopeError" }));
    await startWhatsApp(vi.fn());
    await connectionUpdate(close);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith({ code: "TenantScopeError", connected: false }, "No se pudo registrar el estado del bot");
    await vi.advanceTimersByTimeAsync(3000);
    expect(mocks.makeWASocket).toHaveBeenCalledTimes(2);
  });

  it("al abrir la conexión con la base caída, se loguea y no rechaza", async () => {
    mocks.upsert.mockRejectedValue(new TypeError("fetch failed"));
    await startWhatsApp(vi.fn());
    await expect(connectionUpdate({ connection: "open" })).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalledWith({ code: "TypeError", connected: true }, "No se pudo registrar el estado del bot");
    expect(mocks.info).toHaveBeenCalledWith("WhatsApp conectado.");
  });
});
