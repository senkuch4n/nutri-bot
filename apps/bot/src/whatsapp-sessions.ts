import { createHash } from "node:crypto";
import { lstat, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@nutri-bot/db";
import { LEGACY_TENANT_ID } from "@nutri-bot/db/domain/tenantAccess";
import { env } from "./env";
import { logger } from "./logger";
import { getConversationTenant } from "./tenant";
import { startWhatsApp, type IncomingHandler, type IncomingMediaHandler } from "./whatsapp";
import { startOutboxConsumer } from "./workers";

const LEGACY_KEY = "legacy";
const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const unsafePath = () => new Error("Ruta de credenciales de WhatsApp no segura");

async function ifExists<T>(read: Promise<T>): Promise<T | undefined> {
  try {
    return await read;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

// Resolve existing ancestors even when an auth directory has not been created yet.
async function canonical(location: string): Promise<string> {
  if (await ifExists(lstat(location))) return realpath(location);
  const parent = path.dirname(location);
  if (parent === location) throw unsafePath();
  return path.join(await canonical(parent), path.basename(location));
}

function inside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

/** The bot owns this namespace. Never traverse links below the canonical parent or reuse a key. */
export async function sessionAuthDir(legacyDir: string, tenantId: string, sessionKey: string): Promise<string> {
  if (!tenantId || !UUID_V4.test(sessionKey)) throw unsafePath();
  const configured = path.resolve(legacyDir);
  const legacy = await canonical(configured);
  const parent = await canonical(path.dirname(configured));
  const root = path.join(parent, `${path.basename(configured)}.sessions`);
  if (inside(legacy, root) || inside(root, legacy) || inside(configured, root) || inside(root, configured)) {
    throw unsafePath();
  }

  const tenant = path.join(root, createHash("sha256").update(tenantId).digest("hex"));
  const generation = path.join(tenant, sessionKey);
  const legacyStat = await ifExists(stat(legacy));
  for (const directory of [root, tenant, generation]) {
    const info = await ifExists(lstat(directory));
    if (!info) return generation;
    if (!info.isDirectory() || (legacyStat && info.dev === legacyStat.dev && info.ino === legacyStat.ino)) {
      throw unsafePath();
    }
  }
  for (const entry of await readdir(generation)) {
    const info = await lstat(path.join(generation, entry));
    if (!info.isFile() || info.nlink !== 1) throw unsafePath();
  }
  return generation;
}

export function startWhatsAppSessions(onMessage: IncomingHandler, onMedia?: IncomingMediaHandler): () => void {
  const sessions = new Map<string, { sessionKey: string; stop: () => void }>();
  let stopped = false;
  let polling = false;
  let checkingLegacy = false;
  let legacyVerified = false;

  async function bootstrapLegacy() {
    if (checkingLegacy || legacyVerified) return;
    checkingLegacy = true;
    try {
      const { tenantId } = await getConversationTenant();
      if (stopped || tenantId !== LEGACY_TENANT_ID) return;
      // Only insert if absent. An existing row with null is a durable unlink, not a seed request.
      await prisma.botStatus.createMany({ data: { tenantId, sessionKey: LEGACY_KEY }, skipDuplicates: true });
      legacyVerified = true;
    } catch {
      logger.warn("No se pudo verificar la sesión original de WhatsApp");
    } finally {
      checkingLegacy = false;
    }
  }

  function launch(tenantId: string, sessionKey: string) {
    const controller = new AbortController();
    let stopOutbox: (() => void) | undefined;
    const stopDelivery = () => {
      stopOutbox?.();
      stopOutbox = undefined;
    };
    const entry = { sessionKey, stop: () => { controller.abort(); stopDelivery(); } };
    sessions.set(tenantId, entry);

    const isDesired = async () => !controller.signal.aborted && Boolean(await prisma.botStatus.findUnique({
      where: { tenantId, sessionKey }, select: { tenantId: true },
    })) && !controller.signal.aborted;

    void (async () => {
      const authDir = sessionKey === LEGACY_KEY ? undefined : await sessionAuthDir(env.authDir, tenantId, sessionKey);
      if (controller.signal.aborted) return;
      const { count } = await prisma.botStatus.updateMany({
        where: { tenantId, sessionKey }, data: { connected: false, qr: null },
      });
      if (!count || controller.signal.aborted) return;
      await startWhatsApp(onMessage, onMedia, { tenantId, authDir }, {
        sessionKey,
        signal: controller.signal,
        isDesired,
        validateAuthDir: authDir === undefined ? undefined : async () => {
          if (await sessionAuthDir(env.authDir, tenantId, sessionKey) !== authDir) throw unsafePath();
        },
        onOpen: (connection) => {
          if (!controller.signal.aborted && !stopOutbox) stopOutbox = startOutboxConsumer(connection);
        },
        onClose: stopDelivery,
      });
    })().catch(() => {
      entry.stop();
      if (sessions.get(tenantId) === entry) sessions.delete(tenantId);
      if (!stopped) logger.warn({ tenantId }, "No se pudo iniciar la sesión de WhatsApp");
    });
  }

  async function reconcile() {
    if (stopped || polling) return;
    polling = true;
    try {
      // Don't let a failing or slow verification prevent other tenants from starting.
      void bootstrapLegacy();
      const rows = await prisma.botStatus.findMany({
        where: { sessionKey: { not: null } }, select: { tenantId: true, sessionKey: true },
      });
      if (stopped) return;
      const desired = new Map(rows.flatMap(({ tenantId, sessionKey }) => {
        if (!tenantId || !sessionKey) return [];
        if (sessionKey === LEGACY_KEY && (!legacyVerified || tenantId !== LEGACY_TENANT_ID)) return [];
        return [[tenantId, sessionKey] as const];
      }));
      for (const [tenantId, entry] of sessions) {
        if (desired.get(tenantId) === entry.sessionKey) continue;
        entry.stop();
        sessions.delete(tenantId);
      }
      for (const [tenantId, key] of desired) {
        if (!sessions.has(tenantId)) launch(tenantId, key);
      }
    } catch {
      logger.warn("No se pudieron reconciliar las sesiones de WhatsApp");
    } finally {
      polling = false;
    }
  }

  const timer = setInterval(() => void reconcile(), env.pollIntervalMs);
  void reconcile();
  return () => {
    stopped = true;
    clearInterval(timer);
    for (const entry of sessions.values()) entry.stop();
    sessions.clear();
  };
}
