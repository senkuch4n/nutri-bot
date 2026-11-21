import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ schedule: vi.fn(), reconcile: vi.fn(), expire: vi.fn(), error: vi.fn(), digest: vi.fn(), purge: vi.fn(), clearSessions: vi.fn(), serviceReminders: vi.fn(), prep: vi.fn(), gcal: vi.fn(), mpRefresh: vi.fn(), info: vi.fn() }));
vi.mock("node-cron", () => ({ default: { schedule: mocks.schedule } }));
const outbox = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), resolveScope: vi.fn() }));
vi.mock("@nutri-bot/db", () => ({ prisma: { outboundMessage: outbox } }));
vi.mock("@nutri-bot/db/domain/legacySchedulingScope", () => ({ resolveLegacySchedulingScope: outbox.resolveScope }));
vi.mock("@nutri-bot/db/domain", () => ({
  reconcilePendingPayments: mocks.reconcile, expireStalePendingPayments: mocks.expire,
  enqueueServiceReminders: mocks.serviceReminders,
  enqueuePrepInstructions: mocks.prep, syncGoogleCalendar: mocks.gcal,
  enqueueAfterHoursDigest: mocks.digest,
  purgeExpiredBotAiQuestions: mocks.purge,
  clearExpiredSessionText: mocks.clearSessions,
  refreshMercadoPagoAccountToken: mocks.mpRefresh,
}));
vi.mock("./ai/runtime", () => ({ getBotAiConfig: () => ({ limits: { retentionDays: 90 } }) }));
vi.mock("./whatsapp", () => ({ sendDocument: vi.fn(), sendText: vi.fn() }));

vi.mock("./env", () => ({ env: { pollIntervalMs: 4000 } }));
vi.mock("./logger", () => ({ logger: { info: mocks.info, warn: vi.fn(), error: mocks.error } }));
import { runServiceReminders, runStartupJobs, startCron, startOutboxConsumer } from "./workers";
import { sendDocument, sendText } from "./whatsapp";
import { OUTBOX_INCLUDE } from "./outbound-payload";

describe("single legacy outbox consumer", () => {
  const tenantId = "legacy-tenant";
  const appointment = { appointment: { tenantId } };
  const plan = { plan: { tenantId } };
  const report = { anthropometricReport: { tenantId } };
  const scope = { status: "PENDING", OR: [{ tenantId }, { tenantId: null, AND: [
    { OR: [appointment, plan, report] },
    { OR: [{ appointmentId: null }, appointment] },
    { OR: [{ planId: null }, plan] },
    { OR: [{ anthropometricReportId: null }, report] },
  ] }] };
  const row = { id: "msg", attempts: 0, kind: "MANUAL", body: "fresh text", toJid: "synthetic-jid" };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    outbox.resolveScope.mockResolvedValue({ scope: { tenantId } });
    outbox.findMany.mockResolvedValue([row]);
    outbox.findFirst.mockResolvedValue(row);
    outbox.updateMany.mockResolvedValue({ count: 1 });
    startOutboxConsumer();
  });
  afterEach(() => vi.useRealTimers());
  const poll = () => vi.advanceTimersByTimeAsync(4800);

  it("fails closed without a verified original installation", async () => {
    outbox.resolveScope.mockRejectedValue(new Error("original agenda missing"));
    await poll();
    expect(outbox.findMany).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
    expect(sendDocument).not.toHaveBeenCalled();
    expect(outbox.update).not.toHaveBeenCalled();
    expect(outbox.updateMany).not.toHaveBeenCalled();
  });

  it("filters before taking the ordered batch; skips rows that no longer match without sending or writing", async () => {
    outbox.findFirst.mockResolvedValue(null);
    await poll();
    expect(outbox.findMany.mock.calls).toEqual([[{ where: scope, orderBy: { createdAt: "asc" }, take: 5, select: { id: true } }]]);
    expect(outbox.findFirst.mock.calls).toEqual([[{ where: { ...scope, id: row.id }, include: OUTBOX_INCLUDE }]]);
    expect(sendText).not.toHaveBeenCalled();
    expect(sendDocument).not.toHaveBeenCalled();
    expect(outbox.update).not.toHaveBeenCalled();
    expect(outbox.updateMany).not.toHaveBeenCalled();
  });

  it.each(["text", "document"])("dispatches current %s payload and scopes the success write", async (type) => {
    const pdfData = Buffer.from("pdf");
    if (type === "document") outbox.findFirst.mockResolvedValue({ ...row, kind: "PLAN_PDF", plan: { pdfData, pdfFileName: "plan.pdf" } });
    await poll();
    if (type === "document") {
      expect(vi.mocked(sendDocument).mock.calls).toEqual([[row.toJid, pdfData, "plan.pdf"]]);
      expect(sendText).not.toHaveBeenCalled();
    } else {
      expect(vi.mocked(sendText).mock.calls).toEqual([[row.toJid, row.body]]);
      expect(sendDocument).not.toHaveBeenCalled();
    }
    expect(outbox.update).not.toHaveBeenCalled();
    expect(outbox.updateMany.mock.calls).toEqual([[{ where: { ...scope, id: row.id, attempts: 0 }, data: {
      status: "SENT", sentAt: expect.any(Date), attempts: { increment: 1 }, lastError: null,
    } }]]);
  });

  it.each([[0, "PENDING"], [4, "FAILED"]])("scopes provider failures and preserves retries from attempt %d", async (attempts, status) => {
    outbox.findFirst.mockResolvedValue({ ...row, attempts });
    vi.mocked(sendText).mockRejectedValue(new Error("provider error"));
    await poll();
    expect(vi.mocked(sendText).mock.calls).toEqual([[row.toJid, row.body]]);
    expect(sendDocument).not.toHaveBeenCalled();
    expect(outbox.update).not.toHaveBeenCalled();
    expect(outbox.updateMany.mock.calls).toEqual([[{ where: { ...scope, id: row.id, attempts }, data: {
      status, attempts: attempts + 1, lastError: "provider error",
    } }]]);
  });

  it("pauses on a disconnected provider without writing attempts or dispatching the next row", async () => {
    outbox.findMany.mockResolvedValue([row, { id: "next" }]);
    vi.mocked(sendText).mockRejectedValue(new Error("WhatsApp no está conectado"));
    await poll();
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendDocument).not.toHaveBeenCalled();
    expect(outbox.findFirst).toHaveBeenCalledTimes(1);
    expect(outbox.updateMany).not.toHaveBeenCalled();
    expect(outbox.update).not.toHaveBeenCalled();
  });
});

describe("payment cron without Baileys or database", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    mocks.reconcile.mockResolvedValue({ processed: 1, failed: 0 });
  });
  it("reconciles and expires every minute, not only on five-minute boundaries", async () => {
    vi.setSystemTime(new Date("2026-10-01T12:01:00Z"));
    startCron();
    expect(mocks.schedule.mock.calls[0]?.[0]).toBe("* * * * *");
    await mocks.schedule.mock.calls[0]?.[1]();
    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
    expect(mocks.expire).toHaveBeenCalledTimes(1);
    expect(mocks.reconcile.mock.invocationCallOrder[0]).toBeLessThan(mocks.expire.mock.invocationCallOrder[0]!);
    vi.useRealTimers();
  });
  it("does not expire reservations when a payment lookup fails", async () => {
    mocks.reconcile.mockResolvedValue({ processed: 0, failed: 1 });
    startCron();
    await mocks.schedule.mock.calls[0]?.[1]();
    expect(mocks.expire).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it("contains provider errors and releases the overlap guard", async () => {
    mocks.reconcile.mockRejectedValueOnce(new Error("offline"));
    startCron();
    const tick = mocks.schedule.mock.calls[0]?.[1];
    await expect(tick()).resolves.toBeUndefined();
    await tick();
    expect(mocks.reconcile).toHaveBeenCalledTimes(2);
    expect(mocks.error).toHaveBeenCalled();
    vi.useRealTimers();
  });
  it("skips overlapping ticks", async () => {
    let finish!: (result: { processed: number; failed: number }) => void;
    mocks.reconcile.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    startCron();
    const tick = mocks.schedule.mock.calls[0]?.[1];
    const first = tick();
    await tick();
    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
    finish({ processed: 0, failed: 0 });
    await first;
    vi.useRealTimers();
  });
});

describe("after-hours digest cron (HU-011)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  it("is the last schedule, runs every minute and calls enqueueAfterHoursDigest once per tick", async () => {
    mocks.digest.mockResolvedValue({ digested: 2, outboundId: "out1" });
    startCron();
    const last = mocks.schedule.mock.calls.at(-1)!;
    expect(last[0]).toBe("* * * * *");
    await last[1]();
    expect(mocks.digest).toHaveBeenCalledTimes(1);
    // La conciliación de pagos sigue siendo la primera.
    expect(mocks.schedule.mock.calls.length).toBeGreaterThan(1);
  });
  it("contains errors and releases the flag for the next tick", async () => {
    mocks.digest.mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce({ digested: 0, outboundId: null });
    startCron();
    const tick = mocks.schedule.mock.calls.at(-1)![1];
    await expect(tick()).resolves.toBeUndefined();
    expect(mocks.error).toHaveBeenCalled();
    await tick();
    expect(mocks.digest).toHaveBeenCalledTimes(2);
  });
  it("skips overlapping ticks", async () => {
    let finish!: (r: { digested: number; outboundId: null }) => void;
    mocks.digest.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    startCron();
    const tick = mocks.schedule.mock.calls.at(-1)![1];
    const first = tick();
    await tick();
    expect(mocks.digest).toHaveBeenCalledTimes(1);
    finish({ digested: 0, outboundId: null });
    await first;
  });
});

describe("bot AI retention cron (HU-012)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  it("runs daily at 04:30 with the configured retention, before the digest", async () => {
    mocks.purge.mockResolvedValue(3);
    startCron();
    const idx = mocks.schedule.mock.calls.findIndex((c) => c[0] === "30 4 * * *");
    expect(idx).toBeGreaterThan(0);
    expect(idx).toBe(mocks.schedule.mock.calls.length - 2);
    await mocks.schedule.mock.calls[idx]![1]();
    expect(mocks.purge).toHaveBeenCalledWith({ retentionDays: 90 });
  });
  it("contains errors and runs again on the next tick", async () => {
    mocks.purge.mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce(0);
    startCron();
    const tick = mocks.schedule.mock.calls.find((c) => c[0] === "30 4 * * *")![1];
    await expect(tick()).resolves.toBeUndefined();
    expect(mocks.error).toHaveBeenCalled();
    await tick();
    expect(mocks.purge).toHaveBeenCalledTimes(2);
  });
});

describe("expired session text cleanup cron (HU-012/HU-013)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  it("runs every 5 minutes with the session timeout", async () => {
    mocks.clearSessions.mockResolvedValue(1);
    startCron();
    const call = mocks.schedule.mock.calls.filter((c) => c[0] === "*/5 * * * *").at(-1);
    expect(call).toBeDefined();
    await call![1]();
    expect(mocks.clearSessions).toHaveBeenCalledWith({ sessionTimeoutMs: 20 * 60_000 });
  });
  it("contains errors and runs again on the next tick", async () => {
    mocks.clearSessions.mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce(0);
    startCron();
    const tick = mocks.schedule.mock.calls.filter((c) => c[0] === "*/5 * * * *").at(-1)![1];
    await expect(tick()).resolves.toBeUndefined();
    expect(mocks.error).toHaveBeenCalled();
    await tick();
    expect(mocks.clearSessions).toHaveBeenCalledTimes(2);
  });
});

describe("service reminders cron (HU-014)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  const remindersTick = () => mocks.schedule.mock.calls.filter((c) => c[0] === "*/5 * * * *")[0]![1];

  it("runs every 5 minutes and calls enqueueServiceReminders once per tick", async () => {
    mocks.serviceReminders.mockResolvedValue({ reminders: 1, confirmations: 1 });
    startCron();
    // Dos crons */5: recordatorios (HU-014) y limpieza de sesiones (HU-012/013), en ese orden.
    expect(mocks.schedule.mock.calls.filter((c) => c[0] === "*/5 * * * *")).toHaveLength(2);
    await remindersTick()();
    expect(mocks.serviceReminders).toHaveBeenCalledTimes(1);
    expect(mocks.clearSessions).not.toHaveBeenCalled();
  });

  it("the old 30-minute confirmation cron is gone and payments/digest keep their places", () => {
    startCron();
    expect(mocks.schedule.mock.calls.some((c) => c[0] === "*/30 * * * *")).toBe(false);
    expect(mocks.schedule.mock.calls[0]?.[0]).toBe("* * * * *");
    expect(mocks.schedule.mock.calls.at(-1)?.[0]).toBe("* * * * *");
  });

  it("skips overlapping ticks", async () => {
    let finish!: (r: { reminders: number; confirmations: number }) => void;
    mocks.serviceReminders.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const first = runServiceReminders();
    await runServiceReminders();
    expect(mocks.serviceReminders).toHaveBeenCalledTimes(1);
    finish({ reminders: 0, confirmations: 0 });
    await first;
  });

  it("logs a rejection without throwing and runs again on the next tick", async () => {
    mocks.serviceReminders.mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce({ reminders: 0, confirmations: 0 });
    startCron();
    const tick = remindersTick();
    await expect(tick()).resolves.toBeUndefined();
    expect(mocks.error).toHaveBeenCalled();
    await tick();
    expect(mocks.serviceReminders).toHaveBeenCalledTimes(2);
  });

  it("runStartupJobs calls enqueueServiceReminders", async () => {
    mocks.reconcile.mockResolvedValue({ processed: 0, failed: 0 });
    mocks.serviceReminders.mockResolvedValue({ reminders: 0, confirmations: 0 });
    mocks.prep.mockResolvedValue(0);
    mocks.gcal.mockResolvedValue({ processed: 0 });
    mocks.digest.mockResolvedValue({ digested: 0, outboundId: null });
    mocks.purge.mockResolvedValue(0);
    await runStartupJobs();
    expect(mocks.serviceReminders).toHaveBeenCalledTimes(1);
    expect(mocks.prep).toHaveBeenCalledTimes(1);
  });
});

describe("renovación diaria de Mercado Pago (HU-023)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  it("hay un cron \"0 6 * * *\" cuyo tick renueva una vez", async () => {
    mocks.mpRefresh.mockResolvedValue("refreshed");
    startCron();
    const daily = mocks.schedule.mock.calls.filter((c) => c[0] === "0 6 * * *");
    expect(daily).toHaveLength(1);
    await daily[0]![1]();
    expect(mocks.mpRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.mpRefresh).toHaveBeenCalledWith();
    expect(mocks.info).toHaveBeenCalledWith({ result: "refreshed" }, "Renovación Mercado Pago");
    // Va entre Google Calendar y la limpieza de sesiones; los asserts de orden siguen valiendo.
    const exprs = mocks.schedule.mock.calls.map((c) => c[0]);
    expect(exprs[0]).toBe("* * * * *");
    expect(exprs.at(-2)).toBe("30 4 * * *");
    expect(exprs.indexOf("0 6 * * *")).toBeLessThan(exprs.lastIndexOf("*/5 * * * *"));
  });
  it("not_needed / not_connected no ensucian el log", async () => {
    mocks.mpRefresh.mockResolvedValue("not_needed");
    startCron();
    await mocks.schedule.mock.calls.find((c) => c[0] === "0 6 * * *")![1]();
    expect(mocks.info).not.toHaveBeenCalled();
  });
  it("si la renovación rechaza, no propaga y loguea sin el error crudo", async () => {
    mocks.mpRefresh.mockRejectedValue(new Error("Authorization: Bearer secreto"));
    startCron();
    const tick = mocks.schedule.mock.calls.find((c) => c[0] === "0 6 * * *")![1];
    await expect(tick()).resolves.toBeUndefined();
    expect(mocks.error).toHaveBeenCalledWith("Error renovando Mercado Pago");
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain("secreto");
  });
  it("la conciliación loguea los pagos salteados", async () => {
    mocks.reconcile.mockResolvedValue({ processed: 0, failed: 0, skipped: 2 });
    startCron();
    await mocks.schedule.mock.calls[0]![1]();
    expect(mocks.info).toHaveBeenCalledWith({ processed: 0, failed: 0, skipped: 2 }, "Conciliación Mercado Pago");
    expect(mocks.expire).toHaveBeenCalledTimes(1);
  });
});
