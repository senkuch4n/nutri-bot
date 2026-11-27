import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { startWhatsAppSessions } from "./whatsapp-sessions";

const seams = vi.hoisted(() => ({
  authDir: "", owner: vi.fn(), revalidate: vi.fn(), botStatus: {
    createMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(),
  },
  auth: vi.fn(), socket: vi.fn(), encode: vi.fn(), outbox: vi.fn(),
}));
vi.mock("@nutri-bot/db", () => ({ prisma: { botStatus: seams.botStatus } }));
vi.mock("@/lib/tenant-context", () => ({ requireOwnerContext: seams.owner, requirePageContext: seams.owner }));
vi.mock("@/lib/professional", () => ({ getTenantProfessional: async () => ({ timezone: "UTC" }) }));
vi.mock("@/components/auto-refresh", () => ({ AutoRefresh: () => null }));
vi.mock("@/components/ui", () => ({
  Alert: ({ children }: { children: ReactNode }) => children,
  Button: ({ children }: { children: ReactNode }) => children,
  ButtonLink: () => null,
  PageHeader: () => null,
}));
vi.mock("next/cache", () => ({ revalidatePath: seams.revalidate }));
vi.mock("./env", () => ({ env: { get authDir() { return seams.authDir; }, pollIntervalMs: 100 } }));
vi.mock("./logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("./tenant", () => ({ getConversationTenant: async () => { throw new Error("No legacy installation in this fixture"); } }));
vi.mock("./workers", () => ({ startOutboxConsumer: seams.outbox }));
vi.mock("@whiskeysockets/baileys", () => ({
  default: seams.socket,
  DisconnectReason: { loggedOut: 401 },
  fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] }),
  useMultiFileAuthState: seams.auth,
}));
vi.mock("qrcode", () => ({ default: { toDataURL: seams.encode } }));

const a = "owner-tenant-a";
const b = "owner-tenant-b";
const png = (token: string) => `data:image/png;base64,${Buffer.from(token).toString("base64")}`;
type Row = { tenantId: string; sessionKey: string | null; connected: boolean; qr: string | null; lastConnectedAt: Date | null };
type Filter = {
  tenantId?: string;
  sessionKey?: string | null | { not: null };
  qr?: { not: null };
  connected?: boolean;
  OR?: Filter[];
};

function matches(row: Row, where: Filter): boolean {
  return (where.tenantId === undefined || row.tenantId === where.tenantId)
    && (where.sessionKey === undefined || (where.sessionKey !== null && typeof where.sessionKey === "object"
      ? row.sessionKey !== where.sessionKey.not : row.sessionKey === where.sessionKey))
    && (where.qr === undefined || row.qr !== where.qr.not)
    && (where.connected === undefined || row.connected === where.connected)
    && (where.OR === undefined || where.OR.some((branch) => matches(row, branch)));
}

function fakeBotStatus() {
  const rows = new Map<string, Row>();
  const query = ({ where }: { where: Filter }) => [...rows.values()].filter((row) => matches(row, where));
  seams.botStatus.createMany.mockImplementation(async ({ data, skipDuplicates }: { data: Pick<Row, "tenantId" | "sessionKey">; skipDuplicates: boolean }) => {
    if (rows.has(data.tenantId)) {
      if (!skipDuplicates) throw new Error("Duplicate fake BotStatus tenant");
      return { count: 0 };
    }
    rows.set(data.tenantId, { ...data, qr: null, connected: false, lastConnectedAt: null });
    return { count: 1 };
  });
  seams.botStatus.updateMany.mockImplementation(async ({ where, data }: { where: Filter; data: Partial<Row> }) => {
    const matched = query({ where });
    for (const row of matched) Object.assign(row, data);
    return { count: matched.length };
  });
  const snapshots = (args: { where: Filter; select: Partial<Record<keyof Row, boolean>> }) =>
    query(args).map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => args.select[key as keyof Row])));
  seams.botStatus.findMany.mockImplementation(async (args) => snapshots(args));
  seams.botStatus.findUnique.mockImplementation(async (args) => snapshots(args)[0] ?? null);
  return rows;
}

function fakeSocket(authDir: string) {
  const handlers = new Map<string, (event?: unknown) => unknown>();
  return {
    authDir,
    end: vi.fn(),
    ev: { on: (name: string, handler: (event?: unknown) => unknown) => handlers.set(name, handler) },
    emit: async (name: string, event?: unknown) => {
      const handler = handlers.get(name);
      if (!handler) throw new Error(`Missing Baileys listener: ${name}`);
      await handler(event);
    },
  };
}

it("lets two owners operate independent WhatsApp sessions through the panel and bot", async () => {
  // Load the web entry points through Vitest (web aliases and TSX use the root Vite config).
  const { connectWhatsAppAction, disconnectWhatsAppAction } = await vi.importActual<{
    connectWhatsAppAction: () => Promise<void>; disconnectWhatsAppAction: () => Promise<void>;
  }>("../../web/src/app/(panel)/ajustes/whatsapp/actions");
  const { default: WhatsAppStatusPage } = await vi.importActual<{ default: () => Promise<ReactNode> }>(
    "../../web/src/app/(panel)/ajustes/whatsapp/page",
  );
  const scratch = await realpath(await mkdtemp(path.join(os.tmpdir(), "nutribot-wa-acceptance-")));
  const rows = fakeBotStatus();
  const sockets: ReturnType<typeof fakeSocket>[] = [];
  const stopped = new Map<string, ReturnType<typeof vi.fn>>();
  const asOwner = (tenantId: string) => seams.owner.mockResolvedValue({ tenantId, access: { kind: "member", role: "OWNER" } });
  const panel = async (tenantId: string) => {
    asOwner(tenantId);
    return renderToStaticMarkup(await WhatsAppStatusPage());
  };
  seams.authDir = path.join(scratch, "legacy");
  seams.auth.mockImplementation(async (authDir: string) => {
    expect(path.relative(scratch, authDir)).toMatch(/^legacy\.sessions[/\\]/);
    await mkdir(authDir, { recursive: true });
    return {
      state: { creds: { authDir }, keys: {} },
      saveCreds: () => writeFile(path.join(authDir, "creds.json"), path.basename(authDir)),
    };
  });
  seams.socket.mockImplementation(({ auth }: { auth: { creds: { authDir: string } } }) => {
    const socket = fakeSocket(auth.creds.authDir);
    sockets.push(socket);
    return socket;
  });
  seams.encode.mockImplementation(async (qr: string) => png(qr));
  seams.outbox.mockImplementation(({ tenantId }: { tenantId: string }) => {
    const stop = vi.fn();
    stopped.set(tenantId, stop);
    return stop;
  });
  const socketFor = (key: string) => sockets.find((socket) => path.basename(socket.authDir) === key);
  async function waitForSocket(key: string) {
    return vi.waitFor(() => {
      const socket = socketFor(key);
      if (!socket) throw new Error(`Expected socket for generation ${key}`);
      return socket;
    });
  }
  const creds = (socket: ReturnType<typeof fakeSocket>) => path.join(socket.authDir, "creds.json");
  let stop: (() => void) | undefined;
  vi.useFakeTimers();
  try {
    for (const tenantId of [a, b]) {
      asOwner(tenantId);
      await connectWhatsAppAction();
    }
    const keyA = rows.get(a)?.sessionKey ?? "";
    const keyB = rows.get(b)?.sessionKey ?? "";
    expect(keyA).toBeTruthy();
    expect(keyB).toBeTruthy();
    expect(keyA).not.toBe(keyB);
    stop = startWhatsAppSessions(vi.fn());
    const firstA = await waitForSocket(keyA);
    const firstB = await waitForSocket(keyB);
    expect(path.dirname(firstA.authDir)).not.toBe(path.dirname(firstB.authDir));
    await firstA.emit("creds.update");
    await firstB.emit("creds.update");
    expect(await readFile(creds(firstA), "utf8")).toBe(keyA);
    expect(await readFile(creds(firstB), "utf8")).toBe(keyB);

    await firstA.emit("connection.update", { qr: "only A" });
    await firstB.emit("connection.update", { qr: "only B" });
    const pageA = await panel(a);
    const pageB = await panel(b);
    expect(pageA).toContain(`src="${png("only A")}"`);
    expect(pageA).not.toContain(png("only B"));
    expect(pageB).toContain(`src="${png("only B")}"`);
    expect(pageB).not.toContain(png("only A"));
    await firstA.emit("connection.update", { connection: "open" });
    await firstB.emit("connection.update", { connection: "open" });
    const stopA = stopped.get(a);
    const stopB = stopped.get(b);
    expect(stopA).toBeDefined();
    expect(stopB).toBeDefined();
    const bOpen = { ...rows.get(b) };
    expect(bOpen).toMatchObject({ sessionKey: keyB, connected: true, qr: null });

    // Pause inside QR encoding, then let the old socket finish after unlink
    // but before reconciliation aborts it. This requires the persisted key check.
    let releaseQr!: (value: string) => void;
    seams.encode.mockImplementationOnce(() => new Promise<string>((resolve) => { releaseQr = resolve; }));
    const stale = firstA.emit("connection.update", { qr: "late old A" });
    await Promise.resolve();
    expect(releaseQr).toBeTypeOf("function");
    asOwner(a);
    await disconnectWhatsAppAction();
    expect(rows.get(a)).toMatchObject({ sessionKey: null, qr: null, connected: false });
    const unlinked = await panel(a);
    expect(unlinked).toContain("Vincular WhatsApp");
    expect(unlinked).not.toContain("Desvincular WhatsApp");
    expect(unlinked).not.toContain(png("only A"));
    expect(firstA.end).not.toHaveBeenCalled();
    releaseQr(png("late old A"));
    await stale;
    expect(rows.get(a)).toMatchObject({ sessionKey: null, qr: null, connected: false });
    expect(await panel(a)).not.toContain(png("late old A"));

    await vi.advanceTimersByTimeAsync(3100);
    expect(sockets).toHaveLength(2);
    expect(firstA.end).toHaveBeenCalledTimes(1);
    expect(stopA).toHaveBeenCalledTimes(1);
    expect(firstB.end).not.toHaveBeenCalled();
    expect(stopB).not.toHaveBeenCalled();
    expect(rows.get(b)).toEqual(bOpen);

    await connectWhatsAppAction();
    const freshKey = rows.get(a)?.sessionKey ?? "";
    expect(freshKey).toBeTruthy();
    expect(freshKey).not.toBe(keyA);
    const freshA = await waitForSocket(freshKey);
    expect(freshA.authDir).not.toBe(firstA.authDir);
    await expect(readFile(creds(freshA))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(creds(firstA), "utf8")).toBe(keyA);
    expect(await readFile(creds(firstB), "utf8")).toBe(keyB);
    await freshA.emit("connection.update", { qr: "fresh A" });
    expect(await panel(a)).toContain(`src="${png("fresh A")}"`);
    expect(await panel(b)).not.toContain(png("fresh A"));
    expect(sockets).toHaveLength(3);

    // B's transport reconnects with its existing credentials while A keeps its fresh QR.
    await firstB.emit("connection.update", { connection: "close" });
    await vi.advanceTimersByTimeAsync(3000);
    const secondB = await vi.waitFor(() => {
      expect(sockets).toHaveLength(4);
      return sockets[3]!;
    });
    expect(secondB.authDir).toBe(firstB.authDir);
    expect(await readFile(creds(secondB), "utf8")).toBe(keyB);
    await secondB.emit("connection.update", { connection: "open" });
    expect(rows.get(b)).toMatchObject({ sessionKey: keyB, connected: true, qr: null });
    expect(freshA.end).not.toHaveBeenCalled();
    expect(await panel(a)).toContain(`src="${png("fresh A")}"`);
  } finally {
    stop?.();
    vi.useRealTimers();
    await rm(scratch, { recursive: true, force: true });
  }
});
