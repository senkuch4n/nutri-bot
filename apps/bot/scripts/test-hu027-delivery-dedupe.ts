// Run only via packages/db/scripts/test-hu027-delivery-dedupe.sh.
import assert from "node:assert/strict";
import { fork, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";

const tenantA = "hu027-delivery-a";
const tenantB = "hu027-delivery-b";
const jid = "12025550100@s.whatsapp.net"; // Fictional; deliberately shared by both tenants.
const body = "Synthetic delivery for A";
const priorError = "Synthetic prior retry";

type Role = "winner" | "loser";
type Report =
  | { type: "poll"; ids: string[]; number: number }
  | { type: "send"; jid: string; body: string }
  | { type: "document" }
  | { type: "transaction"; number: number };

function disposableUrl() {
  const nonce = process.env.HU027_DISPOSABLE_NONCE ?? "";
  assert.match(nonce, /^[a-f0-9]{32}$/, "Use the disposable PostgreSQL launcher");
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.protocol, "postgresql:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.ok(url.port);
  assert.equal(url.pathname, `/hu027_${nonce}`);
  return url;
}

async function assertServer(db: PrismaClient, url: URL) {
  const [server] = await db.$queryRaw<{ db: string; version: number }[]>`
    SELECT current_database()::text AS db, current_setting('server_version_num')::int AS version`;
  assert.equal(server?.db, url.pathname.slice(1));
  assert.equal(Math.floor((server?.version ?? 0) / 10000), 16);
}

async function child(db: PrismaClient, role: Role) {
  assert.ok(process.send);
  const report = (event: Report) => process.send!(event);
  // Install the gate before telling the coordinator it can release us.
  async function gate(command: string, event: Report) {
    const released = new Promise<void>((resolve, reject) => {
      process.once("message", (message) => {
        if (message === command) resolve();
        else reject(new Error(`Expected ${command}`));
      });
    });
    report(event);
    await released;
  }

  let polls = 0;
  let transactions = 0;
  let stop: (() => void) | undefined;
  let finish!: () => void;
  let fail!: (error: unknown) => void;
  const finished = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; });
  // No database result is mocked. Pause the loser's second real pending-ID read
  // after PostgreSQL returns it so that the next transaction processes a stale ID.
  const observed = db.$extends({ query: { outboundMessage: {
    async findMany({ args, query }) {
      const rows = await query(args);
      const ids = rows.map(({ id }) => {
        assert.equal(typeof id, "string", "Outbox poll must select the message ID");
        assert.ok(id);
        return id;
      });
      const event = { type: "poll", ids, number: ++polls } as const;
      if (role === "loser" && polls === 2) await gate("resume-stale", event);
      else report(event);
      return rows;
    },
  } } });
  // Observe completed real transactions, not a sleep or a guess from missing sends.
  const client = new Proxy(observed, {
    get(target, key, receiver) {
      if (key !== "$transaction") return Reflect.get(target, key, receiver);
      return async (...args: unknown[]) => {
        try {
          const result = await Reflect.apply(target.$transaction, target, args);
          transactions++;
          report({ type: "transaction", number: transactions });
          if (transactions === (role === "winner" ? 1 : 2)) {
            stop?.();
            finish();
          }
          return result;
        } catch (error) {
          fail(error);
          throw error;
        }
      };
    },
  });
  // Use the DB package's existing client injection seam before loading the workers.
  Object.assign(globalThis, { prisma: client });
  const { startOutboxConsumer } = await import("../src/workers");
  stop = startOutboxConsumer({
    tenantId: tenantA,
    async sendText(to, text) {
      const event = { type: "send", jid: to, body: text } as const;
      if (role === "winner" && transactions === 0) await gate("finish-send", event);
      else report(event);
    },
    async sendDocument() { report({ type: "document" }); },
  });
  try {
    await finished;
  } finally {
    stop();
  }
}

function launch(role: Role) {
  const process = fork(fileURLToPath(import.meta.url), [role], { stdio: ["ignore", "inherit", "inherit", "ipc"] });
  const reports: Report[] = [];
  let exit: string | undefined;
  const closed = new Promise<void>((resolve) => {
    process.once("error", (error) => { exit = String(error); });
    process.once("close", (code, signal) => { exit = `${code ?? signal}`; resolve(); });
  });
  process.on("message", (message) => reports.push(message as Report));
  return { process, reports, closed, exit: () => exit };
}

type Probe = ReturnType<typeof launch>;
async function waitFor(probe: Probe, description: string, ready: () => boolean) {
  const deadline = Date.now() + 15_000;
  while (!ready()) {
    assert.equal(probe.exit(), undefined, `Child exited before ${description}`);
    assert.ok(Date.now() < deadline, `Timed out waiting for ${description}: ${JSON.stringify(probe.reports)}`);
    await delay(20);
  }
}

async function fixture(db: PrismaClient, tenantId: string, professionalId: number, text: string) {
  await db.tenant.create({ data: { id: tenantId } });
  await db.professional.create({ data: {
    id: professionalId, tenantId, name: tenantId, email: `${tenantId}@example.test`, timezone: "UTC",
  } });
  await db.agenda.create({ data: { tenantId, professionalId, isPrimary: true } });
  return db.outboundMessage.create({ data: {
    tenantId, toJid: jid, body: text, kind: "AD_HOC", attempts: 2, lastError: priorError,
  } });
}

async function coordinate(db: PrismaClient) {
  assert.equal(await db.outboundMessage.count(), 0, "Expected an empty disposable outbox");
  const a = await fixture(db, tenantA, 270271, body);
  const b = await fixture(db, tenantB, 270272, "Synthetic delivery for B");
  const get = (id: string) => db.outboundMessage.findUniqueOrThrow({ where: { id } });
  const winner = launch("winner");
  let loser: Probe | undefined;
  const poll = (number: number) => ({ type: "poll", ids: [a.id], number });
  const tx = (number: number) => ({ type: "transaction", number });
  const send = { type: "send", jid, body };
  try {
    await waitFor(winner, "winner to enter the synthetic send", () => winner.reports.length >= 2);
    assert.deepEqual(winner.reports, [poll(1), send]);
    const contender = loser = launch("loser");
    assert.ok(winner.process.pid && contender.process.pid && winner.process.pid !== contender.process.pid);
    await waitFor(contender, "loser to finish contention and capture a stale ID", () => contender.reports.length >= 3);
    assert.deepEqual(contender.reports, [poll(1), tx(1), poll(2)]);
    assert.deepEqual(await get(a.id), a, "Loser must leave A unchanged while the winner is paused");
    assert.deepEqual(await get(b.id), b, "Same-JID tenant B must remain untouched during contention");

    winner.process.send("finish-send");
    await waitFor(winner, "winner to commit", () => winner.reports.length >= 3);
    const sent = await get(a.id);
    assert.ok(sent.sentAt instanceof Date);
    assert.deepEqual(sent, { ...a, status: "SENT", attempts: 3, lastError: null, sentAt: sent.sentAt });

    contender.process.send("resume-stale");
    await waitFor(contender, "loser to finish checking the stale ID", () => contender.reports.length >= 4);
    await waitFor(winner, "winner to close", () => winner.exit() !== undefined);
    await waitFor(contender, "loser to close", () => contender.exit() !== undefined);
    assert.equal(winner.exit(), "0");
    assert.equal(contender.exit(), "0");
    assert.deepEqual(winner.reports, [poll(1), send, tx(1)]);
    assert.deepEqual(contender.reports, [poll(1), tx(1), poll(2), tx(2)]);
    assert.deepEqual(await get(a.id), sent, "The stale poll must not send or update A again");
    assert.deepEqual(await get(b.id), b, "Tenant B must remain unchanged despite sharing the JID");
    assert.equal(await db.outboundMessage.count(), 2);
    console.log("HU-027 delivery: two processes; winner sent once (SENT, attempts 2→3); loser skipped contention and stale ID; same-JID tenant B unchanged.");
  } finally {
    const probes = loser ? [winner, loser] : [winner];
    for (const probe of probes) if (probe.exit() === undefined) probe.process.kill("SIGKILL");
    await Promise.all(probes.map(({ closed }) => closed));
  }
}

async function main() {
  const url = disposableUrl();
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ datasourceUrl: url.href });
  try {
    await assertServer(db, url);
    const role = process.argv[2];
    if (role === "winner" || role === "loser") await child(db, role);
    else {
      assert.equal(role, undefined);
      await coordinate(db);
    }
  } finally {
    await db.$disconnect();
    if (process.connected) process.disconnect?.();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
