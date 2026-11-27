// Run via test-hu027-enqueue-dedupe.sh only. No bot or WhatsApp transport is loaded.
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { prisma } from "../index";
import { enqueueAfterHoursDigest, recordInquiryMessage } from "../domain/inquiries";
import { enqueuePrepInstructions, enqueueServiceReminders } from "../domain/reminders";

const HOUR = 3_600_000;
const startsAt = new Date(Date.now() + 6 * HOUR);
const jid = "12025550100@s.whatsapp.net"; // Same fictional recipient in both tenants.
const digestNow = new Date("2026-11-26T12:00:00Z");
const lockClass = 27027;
const lockKey = 1;

async function assertDisposable() {
  const nonce = process.env.HU027_DISPOSABLE_NONCE ?? "";
  assert.match(nonce, /^[a-f0-9]{32}$/, "Use the disposable PostgreSQL launcher");
  const database = `hu027_${nonce}`;
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.protocol, "postgresql:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.ok(url.port);
  assert.equal(url.pathname, `/${database}`);
  const [server] = await prisma.$queryRaw<{ db: string; version: number }[]>`
    SELECT current_database()::text AS db, current_setting('server_version_num')::int AS version`;
  assert.equal(server.db, database);
  assert.equal(Math.floor(server.version / 10000), 16);
  assert.equal(await prisma.outboundMessage.count(), 0);
}

async function fixture(suffix: string, professionalId: number) {
  const { id: tenantId } = await prisma.tenant.create({ data: { id: `hu027-${suffix}` } });
  await prisma.professional.create({ data: {
    tenantId, id: professionalId, name: `Synthetic ${suffix}`, email: `${suffix}@example.test`, timezone: "UTC",
  } });
  const agenda = await prisma.agenda.create({ data: { tenantId, professionalId, isPrimary: true } });
  const patient = await prisma.patient.create({ data: { tenantId, whatsappJid: jid, phone: "12025550100" } });
  const service = await prisma.service.create({ data: {
    tenantId, name: `Synthetic service ${suffix}`, price: 100, durationMin: 30,
    prepInstructions: "Synthetic instructions", prepLeadHours: 8,
    reminders: [{ amount: 24, unit: "HOURS", asksConfirmation: false }],
  } });
  const appointment = await prisma.appointment.create({ data: {
    tenantId, agendaId: agenda.id, patientId: patient.id, serviceId: service.id,
    startsAt, endsAt: new Date(startsAt.getTime() + HOUR / 2),
    bookedAt: new Date(startsAt.getTime() - 48 * HOUR), createdBy: "PATIENT", priceSnapshot: 100,
  } });
  const { inquiry } = await recordInquiryMessage({ tenantId }, {
    patientId: patient.id, text: `Synthetic inquiry ${suffix}`, afterHours: true,
    at: new Date("2026-11-26T05:00:00Z"),
  });
  return { tenantId, appointmentId: appointment.id, inquiryId: inquiry.id };
}

async function installInsertGate() {
  // The test-only trigger stops both INSERTs after the domain's eligibility reads.
  // The shared locks do not serialize the two contenders once the exclusive gate opens.
  await prisma.$executeRaw`CREATE FUNCTION hu027_insert_gate() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM pg_advisory_xact_lock_shared(27027, 1);
      RETURN NEW;
    END;
    $$`;
  await prisma.$executeRaw`CREATE TRIGGER hu027_insert_gate BEFORE INSERT ON "OutboundMessage"
    FOR EACH ROW EXECUTE FUNCTION hu027_insert_gate()`;
}

async function race<T>(run: () => Promise<T>) {
  let runs: Promise<PromiseSettledResult<T>[]> | undefined;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${lockClass}::int, ${lockKey}::int)`;
      runs = Promise.allSettled([run(), run()]);
      const deadline = Date.now() + 3500; // Less than the digest's default transaction timeout.
      while (Date.now() < deadline) {
        const [locks] = await tx.$queryRaw<{ waiting: number }[]>`
          SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = 'advisory'
            AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
            AND classid::bigint = ${lockClass}::bigint AND objid::bigint = ${lockKey}::bigint
            AND objsubid = 2 AND NOT granted`;
        if (locks.waiting === 2) return;
        await delay(25);
      }
      assert.fail("Both calls must reach PostgreSQL INSERT before the gate is released");
    });
  } finally {
    await runs; // Even on a failed gate, let both jobs settle before disconnecting.
  }
  assert.ok(runs);
  return runs;
}

function fulfilled<T>(result: PromiseSettledResult<T>): T {
  if (result.status === "rejected") throw result.reason;
  return result.value;
}

const outboundRows = () => prisma.outboundMessage.findMany({
  select: { tenantId: true, appointmentId: true, kind: true, dedupeKey: true, toJid: true, status: true },
});
type OutboundRow = Awaited<ReturnType<typeof outboundRows>>[number];

async function assertOutbox(expected: OutboundRow[]) {
  // Compare the complete set, independently of PostgreSQL's enum ordering.
  const sorted = (rows: OutboundRow[]) => [...rows].sort((left, right) =>
    `${left.tenantId}:${left.kind}`.localeCompare(`${right.tenantId}:${right.kind}`));
  assert.deepEqual(sorted(await outboundRows()), sorted(expected));
}

async function main() {
  await assertDisposable();
  const a = await fixture("a", 270271);
  const b = await fixture("b", 270272);
  await installInsertGate();

  const expectedAppointments: OutboundRow[] = [];
  for (const { tenantId, appointmentId } of [a, b]) {
    const tenant = { tenantId };
    const reminderNow = new Date(startsAt.getTime() - 24 * HOUR);
    const reminder = () => enqueueServiceReminders(tenant, { now: reminderNow });
    const prep = () => enqueuePrepInstructions(tenant);
    const reminderCounts = (await race(reminder)).map(fulfilled);
    assert.deepEqual(reminderCounts.map((result) => result.reminders).sort(), [0, 1]);
    assert.deepEqual(reminderCounts.map((result) => result.confirmations), [0, 0]);
    assert.deepEqual((await race(prep)).map(fulfilled).sort(), [0, 1]);
    assert.deepEqual(await reminder(), { reminders: 0, confirmations: 0 });
    assert.equal(await prep(), 0);
    expectedAppointments.push(
      { tenantId, appointmentId, kind: "REMINDER", dedupeKey: "auto:24h", toJid: jid, status: "PENDING" },
      { tenantId, appointmentId, kind: "PREP_INSTRUCTIONS", dedupeKey: "", toJid: jid, status: "PENDING" },
    );
    await assertOutbox(expectedAppointments);
  }
  console.log("PASS: reminder and prep INSERT races, repeats, and persistent rows for two tenants sharing a JID");

  const expectedDigests: OutboundRow[] = [];
  for (const [tenant, other] of [[a, b], [b, a]] as const) {
    const digest = () => enqueueAfterHoursDigest({ tenantId: tenant.tenantId }, {
      now: digestNow, config: { enabled: true, start: "22:00", end: "09:00" }, alertJid: jid,
    });
    const beforeOther = await prisma.patientInquiry.findUniqueOrThrow({ where: { id: other.inquiryId } });
    const results = await race(digest);
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.message, "enqueueAfterHoursDigest: se esperaban 1 consultas, se marcaron 0");
    const [winner] = results.filter((result) => result.status === "fulfilled").map(fulfilled);
    assert.equal(winner.digested, 1);
    assert.ok(winner.outboundId);
    const outbound = await prisma.outboundMessage.findUniqueOrThrow({ where: { id: winner.outboundId } });
    assert.equal(outbound.tenantId, tenant.tenantId);
    assert.deepEqual(await digest(), { digested: 0, outboundId: null });
    const inquiry = await prisma.patientInquiry.findUniqueOrThrow({ where: { id: tenant.inquiryId } });
    assert.deepEqual(inquiry.digestedAt, digestNow);
    assert.deepEqual(await prisma.patientInquiry.findUniqueOrThrow({ where: { id: other.inquiryId } }), beforeOther);
    expectedDigests.push({
      tenantId: tenant.tenantId, appointmentId: null, kind: "PROFESSIONAL_ALERT", dedupeKey: "", toJid: jid, status: "PENDING",
    });
    await assertOutbox([...expectedAppointments, ...expectedDigests]);
  }
  console.log("PASS: concurrent digest loser rolled back its outbound; one committed digest per tenant and repeats are empty");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
