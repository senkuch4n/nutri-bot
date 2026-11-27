import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedWhatsApp } from "./whatsapp";

const mocks = vi.hoisted(() => ({
  authDir: "", start: vi.fn(), consume: vi.fn(), verify: vi.fn(), warn: vi.fn(),
  createMany: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(),
}));
vi.mock("./env", () => ({ env: { get authDir() { return mocks.authDir; }, pollIntervalMs: 100 } }));
vi.mock("./logger", () => ({ logger: { warn: mocks.warn } }));
vi.mock("./tenant", () => ({ getConversationTenant: mocks.verify }));
vi.mock("./whatsapp", () => ({ startWhatsApp: mocks.start }));
vi.mock("./workers", () => ({ startOutboxConsumer: mocks.consume }));
vi.mock("@nutri-bot/db", () => ({ prisma: { botStatus: mocks } }));

import { sessionAuthDir, startWhatsAppSessions } from "./whatsapp-sessions";

const legacy = "legacy-tenant";
const key1 = "10000000-0000-4000-8000-000000000000";
const key2 = "20000000-0000-4000-8000-000000000000";
const observe = () => vi.advanceTimersByTimeAsync(100);
let scratch: string;
let stop: (() => void) | undefined;
let rows: Map<string, string | null>;

beforeEach(async () => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  scratch = await realpath(await mkdtemp(path.join(os.tmpdir(), "nutribot-session-test-")));
  mocks.authDir = path.join(scratch, "legacy-auth");
  rows = new Map();
  mocks.verify.mockResolvedValue({ tenantId: legacy });
  mocks.createMany.mockImplementation(async ({ data, skipDuplicates }) => {
    if (skipDuplicates && rows.has(data.tenantId)) return { count: 0 };
    rows.set(data.tenantId, data.sessionKey);
    return { count: 1 };
  });
  mocks.findMany.mockImplementation(async () => [...rows].filter(([, key]) => key !== null).map(([tenantId, sessionKey]) => ({ tenantId, sessionKey })));
  mocks.findUnique.mockImplementation(async ({ where }) => rows.get(where.tenantId) === where.sessionKey ? { tenantId: where.tenantId } : null);
  mocks.updateMany.mockImplementation(async ({ where }) => ({ count: Number(rows.get(where.tenantId) === where.sessionKey) }));
});

afterEach(async () => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
  await rm(scratch, { recursive: true, force: true });
});

function byTenant(tenantId: string) {
  return mocks.start.mock.calls.filter(([, , tenant]) => tenant.tenantId === tenantId);
}

async function waitForStarts(tenantId: string, count: number) {
  await vi.waitFor(() => expect(byTenant(tenantId)).toHaveLength(count));
}

describe("WhatsApp desired sessions", () => {
  it("bootstraps only the verified missing legacy installation without adopting other legacy rows", async () => {
    rows.set("impostor", "legacy");
    stop = startWhatsAppSessions(vi.fn());
    await observe();
    expect(mocks.createMany.mock.calls).toEqual([[{ data: { tenantId: legacy, sessionKey: "legacy" }, skipDuplicates: true }]]);
    expect(mocks.start.mock.calls.map(([, , tenant]) => tenant)).toEqual([{ tenantId: legacy, authDir: undefined }]);
    expect(rows.get(legacy)).toBe("legacy");
  });

  it("never restarts a stopped legacy row and rotates the auth path after unlink and relink", async () => {
    rows.set(legacy, null).set("a", key1);
    stop = startWhatsAppSessions(vi.fn());
    await waitForStarts("a", 1);
    const [, , first, options] = byTenant("a")[0]!;
    const old = options as ManagedWhatsApp;
    const binding = { tenantId: "a", sendText: vi.fn(), sendDocument: vi.fn(), sendTyping: vi.fn() };
    const stopOutbox = vi.fn();
    mocks.consume.mockReturnValue(stopOutbox);
    old.onOpen(binding);
    old.onOpen(binding);
    await observe();
    expect(mocks.consume.mock.calls).toEqual([[binding]]);
    rows.set("a", null);
    expect(await old.isDesired()).toBe(false);
    await observe();
    expect(old.signal.aborted).toBe(true);
    expect(stopOutbox).toHaveBeenCalledTimes(1);
    old.onOpen(binding);
    expect(mocks.consume).toHaveBeenCalledTimes(1);
    await mkdir(first.authDir, { recursive: true });
    await writeFile(path.join(first.authDir, "creds.json"), "synthetic");
    rows.set("a", key2);
    await waitForStarts("a", 2);
    const [, , second] = byTenant("a")[1]!;
    expect(second.authDir).not.toBe(first.authDir);
    await expect(readFile(path.join(second.authDir, "creds.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(first.authDir, "creds.json"), "utf8")).toBe("synthetic");
    expect(rows.get(legacy)).toBeNull();
    expect(byTenant(legacy)).toEqual([]);
  });

  it("starts other tenants even when legacy verification hangs and a tenant startup fails", async () => {
    mocks.verify.mockReturnValue(new Promise(() => {}));
    rows.set("a", key1).set("b", key1);
    mocks.start.mockImplementation(async (_text, _media, { tenantId }) => {
      if (tenantId === "a") throw new Error("synthetic startup failure");
    });
    stop = startWhatsAppSessions(vi.fn());
    await vi.waitFor(() => expect(mocks.warn).toHaveBeenCalledWith({ tenantId: "a" }, "No se pudo iniciar la sesión de WhatsApp"));
    await waitForStarts("b", 1);
    expect(mocks.createMany).not.toHaveBeenCalled();
    await observe();
    expect(byTenant("b")).toHaveLength(1);
  });
});

describe("session auth namespace", () => {
  it("canonicalizes the parent and keeps tenant and generation paths separate from legacy", async () => {
    await mkdir(path.join(scratch, "real"));
    const alias = path.join(scratch, "alias");
    await symlink(path.join(scratch, "real"), alias);
    const configured = path.join(alias, "auth");
    const first = await sessionAuthDir(configured, "../A", key1);
    expect(first).toBe(await sessionAuthDir(path.join(scratch, "real", "auth"), "../A", key1));
    expect(first).not.toBe(await sessionAuthDir(configured, "../a", key1));
    expect(first).not.toBe(await sessionAuthDir(configured, "../A", key2));
    expect(first.startsWith(path.join(scratch, "real", "auth.sessions") + path.sep)).toBe(true);
    await expect(sessionAuthDir(configured, "A", "../legacy")).rejects.toThrow("no segura");
  });

  it("rejects overlap with legacy, a symlinked scoped root, and a symlinked credential", async () => {
    const scopedRoot = `${mocks.authDir}.sessions`;
    await mkdir(scopedRoot);
    await symlink(scopedRoot, mocks.authDir);
    await expect(sessionAuthDir(mocks.authDir, "a", key1)).rejects.toThrow("no segura");
    const otherLegacy = path.join(scratch, "other");
    await mkdir(otherLegacy);
    await symlink(otherLegacy, `${otherLegacy}.sessions`);
    await expect(sessionAuthDir(otherLegacy, "a", key1)).rejects.toThrow("no segura");
    const cleanLegacy = path.join(scratch, "clean");
    const generation = await sessionAuthDir(cleanLegacy, "a", key1);
    await mkdir(generation, { recursive: true });
    await symlink(path.join(otherLegacy, "creds.json"), path.join(generation, "creds.json"));
    await expect(sessionAuthDir(cleanLegacy, "a", key1)).rejects.toThrow("no segura");
  });
});
