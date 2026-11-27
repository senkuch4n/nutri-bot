// HU-025b2: registrar el estado del bot (BotStatus) nunca corta la conexión ni la reconexión.
// Baileys, la base y el tenant están mockeados: no hay WhatsApp real ni Postgres.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: {} as Record<string, (u: unknown) => Promise<void>>,
  makeWASocket: vi.fn(),
  upsert: vi.fn(),
  updateMany: vi.fn(),
  end: vi.fn(),
  tenant: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  authDir: "/tmp/no-se-usa",
  useAuth: vi.fn(),
  renderQr: vi.fn(),
  encodeQr: vi.fn(),
}));

vi.mock("@whiskeysockets/baileys", () => ({
  default: mocks.makeWASocket,
  DisconnectReason: { loggedOut: 401 },
  fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] }),
  normalizeMessageContent: (m: unknown) => m,
  useMultiFileAuthState: mocks.useAuth,
}));
vi.mock("pino", () => ({ default: () => ({}) }));
vi.mock("qrcode-terminal", () => ({ default: { generate: mocks.renderQr } }));
vi.mock("qrcode", () => ({ default: { toDataURL: mocks.encodeQr } }));
vi.mock("@nutri-bot/db", () => ({ prisma: { botStatus: { upsert: mocks.upsert, updateMany: mocks.updateMany } } }));
vi.mock("./env", () => ({ env: { get authDir() { return mocks.authDir; } } }));
vi.mock("./logger", () => ({ logger: { warn: mocks.warn, info: mocks.info, error: mocks.error, debug: vi.fn() } }));
vi.mock("./tenant", () => ({ getConversationTenant: mocks.tenant }));

import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startWhatsApp } from "./whatsapp";

const close = { connection: "close", lastDisconnect: { error: { output: { statusCode: 500 } } } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  mocks.handlers = {};
  mocks.makeWASocket.mockImplementation(() => ({
    ev: { on: (event: string, fn: (u: unknown) => Promise<void>) => { mocks.handlers[event] = fn; } },
    end: mocks.end,
  }));
  mocks.useAuth.mockResolvedValue({ state: {}, saveCreds: vi.fn() });
  mocks.encodeQr.mockImplementation(async (qr: string) => `data:image/png;base64,${qr}`);
  mocks.tenant.mockResolvedValue({ tenantId: "legacy-tenant" });
  mocks.upsert.mockResolvedValue({});
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.useRealTimers();
});

async function connectionUpdate(u: unknown) {
  await mocks.handlers["connection.update"]!(u);
}

describe("receiving WhatsApp connection", () => {
  it("passes the bound tenant to text and media callbacks for the same sender on two sockets", async () => {
    const text = vi.fn();
    const media = vi.fn();
    const jid = "5491100000000@s.whatsapp.net";
    await startWhatsApp(text, media, { tenantId: "a" });
    const receiveA = mocks.handlers["messages.upsert"]!;
    await startWhatsApp(text, media, { tenantId: "b" });
    const receiveB = mocks.handlers["messages.upsert"]!;
    for (const receive of [receiveA, receiveB]) {
      await receive({ type: "notify", messages: [
        { key: { remoteJid: jid }, message: { conversation: "Hola" } },
        { key: { remoteJid: jid }, message: { imageMessage: {} } },
      ] });
    }
    expect(text.mock.calls).toEqual([
      [jid, "Hola", expect.objectContaining({ tenantId: "a" })],
      [jid, "Hola", expect.objectContaining({ tenantId: "b" })],
    ]);
    expect(media.mock.calls).toEqual([
      [jid, expect.objectContaining({ tenantId: "a" })],
      [jid, expect.objectContaining({ tenantId: "b" })],
    ]);
  });
});

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

describe("managed WhatsApp generation", () => {
  it("compares status by key and cancels a queued reconnect when unlinked", async () => {
    const controller = new AbortController();
    const onOpen = vi.fn();
    const onClose = vi.fn();
    await startWhatsApp(vi.fn(), undefined, { tenantId: "a", authDir: "/synthetic/a" }, {
      sessionKey: "key-a", signal: controller.signal, isDesired: async () => true, onOpen, onClose,
    });
    await connectionUpdate({ connection: "open" });
    await connectionUpdate({ connection: "open" });
    await connectionUpdate(close);
    controller.abort();
    await vi.advanceTimersByTimeAsync(3000);
    expect(mocks.makeWASocket).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { tenantId: "a", sessionKey: "key-a" }, data: { connected: false, qr: null } });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    await expect(onOpen.mock.calls[0]![0].sendDocument("synthetic", Buffer.alloc(0), "file.pdf")).rejects.toThrow("no está conectado");
  });
});

describe("stale managed events", () => {
  it("cannot publish a QR computed after stop or consume an open for an obsolete key", async () => {
    const controller = new AbortController();
    const onOpen = vi.fn();
    await startWhatsApp(vi.fn(), undefined, { tenantId: "a", authDir: "/synthetic/a" }, {
      sessionKey: "old", signal: controller.signal, isDesired: async () => true, onOpen, onClose: vi.fn(),
    });
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    await connectionUpdate({ connection: "open" });
    expect(onOpen).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    let release!: (value: string) => void;
    mocks.encodeQr.mockImplementationOnce(() => new Promise<string>((resolve) => { release = resolve; }));
    const qr = connectionUpdate({ qr: "synthetic" });
    await Promise.resolve();
    controller.abort();
    release("encoded");
    await qr;
    expect(mocks.end.mock.calls).toEqual([[undefined]]);
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("independent WhatsApp session lifecycle", () => {
  let scratch: string;
  let aDir: string;
  let bDir: string;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(os.tmpdir(), "nutribot-wa-scoped-"));
    aDir = path.join(scratch, "a");
    bDir = path.join(scratch, "b");
    await Promise.all([mkdir(aDir), mkdir(bDir)]);
    mocks.useAuth.mockImplementation(async (dir: string) => ({
      state: { keys: { set: () => writeFile(path.join(dir, "keys.json"), "synthetic-keys") } },
      saveCreds: () => writeFile(path.join(dir, "creds.json"), `synthetic-${path.basename(dir)}`),
    }));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  async function startPair() {
    const tenantA = { tenantId: "a", authDir: aDir };
    const tenantB = { tenantId: "b", authDir: bDir };
    const receiveA = vi.fn();
    await startWhatsApp(receiveA, undefined, tenantA);
    const a = { ...mocks.handlers };
    await startWhatsApp(vi.fn(), undefined, tenantB);
    return { a, b: { ...mocks.handlers }, receiveA };
  }

  it("uses explicit auth paths and saves credentials to each session's own folder", async () => {
    const { a, b } = await startPair();
    expect(mocks.useAuth.mock.calls).toEqual([[aDir], [bDir]]);
    await Promise.all([a["creds.update"]!(null), b["creds.update"]!(null)]);
    expect(await readFile(path.join(aDir, "creds.json"), "utf8")).toBe("synthetic-a");
    expect(await readFile(path.join(bDir, "creds.json"), "utf8")).toBe("synthetic-b");
  });

  it("writes each QR to its tenant without exposing scoped QR in terminal or logs", async () => {
    const { a, b } = await startPair();
    await Promise.all([
      a["connection.update"]!({ qr: "synthetic-qr-a" }),
      b["connection.update"]!({ qr: "synthetic-qr-b" }),
    ]);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    for (const tenantId of ["a", "b"]) {
      const data = { connected: false, qr: `data:image/png;base64,synthetic-qr-${tenantId}` };
      expect(mocks.upsert).toHaveBeenCalledWith({ where: { tenantId }, create: { tenantId, ...data }, update: data });
    }
    expect(mocks.tenant).not.toHaveBeenCalled();
    expect(mocks.renderQr).not.toHaveBeenCalled();
    expect(JSON.stringify([mocks.info.mock.calls, mocks.warn.mock.calls, mocks.error.mock.calls])).not.toContain("synthetic-qr");
  });

  it("does not publish a QR whose socket closed during encoding", async () => {
    const { a } = await startPair();
    let finishEncoding!: (value: string) => void;
    mocks.encodeQr.mockImplementationOnce(() => new Promise<string>((resolve) => { finishEncoding = resolve; }));
    const qr = a["connection.update"]!({ qr: "stale-qr" });
    await Promise.resolve();
    const closed = a["connection.update"]!(close);
    finishEncoding("data:image/png;base64,stale-qr");
    await Promise.all([qr, closed]);
    expect(mocks.upsert.mock.calls.map(([call]) => call.update)).toEqual([{ connected: false, qr: null }]);
  });

  it("reconnects only the closed session once and ignores old sockets", async () => {
    const { a, b, receiveA } = await startPair();
    const oldKeys = mocks.makeWASocket.mock.calls[0]![0].auth.keys;
    await Promise.all([a["connection.update"]!(close), a["connection.update"]!(close)]);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(mocks.useAuth.mock.calls).toEqual([[aDir], [bDir], [aDir]]);
    await a["connection.update"]!({ connection: "open", qr: "stale" });
    await a["creds.update"]!(null);
    await oldKeys.set({});
    await a["messages.upsert"]!({ type: "notify", messages: [
      { key: { remoteJid: "123@s.whatsapp.net" }, message: { conversation: "stale" } },
    ] });
    expect(receiveA).not.toHaveBeenCalled();
    await a["connection.update"]!(close);
    await b["connection.update"]!({ connection: "open" });
    expect(vi.getTimerCount()).toBe(0);
    expect(await readdir(aDir)).toEqual([]);
    expect(mocks.upsert.mock.calls.map(([call]) => [call.where.tenantId, call.update.connected])).toEqual([
      ["a", false], ["b", true],
    ]);
  });

  it("logout drains pending credential writes and empties only the rejected session", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    mocks.useAuth.mockImplementationOnce(async () => ({
      state: {},
      saveCreds: async () => {
        await pending;
        await writeFile(path.join(aDir, "creds.json"), "synthetic-a");
      },
    }));
    const { a, b } = await startPair();
    await b["creds.update"]!(null);
    const save = a["creds.update"]!(null);
    const logout = a["connection.update"]!({ ...close, lastDisconnect: { error: { output: { statusCode: 401 } } } });
    release();
    await Promise.all([save, logout]);
    expect(await readdir(aDir)).toEqual([]);
    expect(await readFile(path.join(bDir, "creds.json"), "utf8")).toBe("synthetic-b");
    await vi.advanceTimersByTimeAsync(3000);
    expect(mocks.useAuth.mock.calls).toEqual([[aDir], [bDir], [aDir]]);
  });

  it("keeps the default auth path and the terminal QR for the original startup", async () => {
    mocks.useAuth.mockResolvedValueOnce({ state: {}, saveCreds: vi.fn() });
    await startWhatsApp(vi.fn(), undefined, { tenantId: "legacy-tenant" });
    await connectionUpdate({ qr: "synthetic-legacy" });
    expect(mocks.useAuth.mock.calls).toEqual([[mocks.authDir]]);
    expect(mocks.renderQr).toHaveBeenCalledWith("synthetic-legacy", { small: true });
  });
});

describe("logout de WhatsApp: se recupera solo", () => {
  const loggedOut = { connection: "close", lastDisconnect: { error: { output: { statusCode: 401 } } } };
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(os.tmpdir(), "nutribot-wa-"));
    mocks.authDir = path.join(scratch, "auth");
    await mkdir(path.join(mocks.authDir, "sub"), { recursive: true });
    await writeFile(path.join(mocks.authDir, "creds.json"), "{}");
    await writeFile(path.join(mocks.authDir, "sub", "pre-key-1.json"), "{}");
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it("borra la sesión rechazada (sin borrar la carpeta) y vuelve a arrancar para generar un QR nuevo", async () => {
    await startWhatsApp(vi.fn());
    await connectionUpdate(loggedOut);
    expect(await readdir(mocks.authDir)).toEqual([]);
    expect(mocks.error).toHaveBeenCalledWith(
      "Sesión cerrada (logout): se borró la sesión y se genera un QR nuevo para volver a vincular.",
    );
    await vi.advanceTimersByTimeAsync(3000);
    expect(mocks.makeWASocket).toHaveBeenCalledTimes(2);
  });

  it("si no puede borrar la sesión, no reintenta (evita un bucle de logout) y loguea solo el código", async () => {
    mocks.authDir = path.join(scratch, "no-es-carpeta");
    await writeFile(mocks.authDir, "x"); // readdir falla con ENOTDIR
    await startWhatsApp(vi.fn());
    await expect(connectionUpdate(loggedOut)).resolves.toBeUndefined();
    expect(mocks.error).toHaveBeenCalledWith(
      { code: "ENOTDIR" },
      "Sesión cerrada (logout) y no se pudo borrar la sesión: hay que borrarla a mano y reiniciar el bot.",
    );
    await vi.advanceTimersByTimeAsync(3000);
    expect(mocks.makeWASocket).toHaveBeenCalledTimes(1);
  });
});
