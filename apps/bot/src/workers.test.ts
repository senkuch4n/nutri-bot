import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ schedule: vi.fn(), reconcile: vi.fn(), expire: vi.fn(), error: vi.fn(), digest: vi.fn(), purge: vi.fn(), clearSessions: vi.fn(), serviceReminders: vi.fn(), prep: vi.fn(), gcal: vi.fn() }));
vi.mock("node-cron", () => ({ default: { schedule: mocks.schedule } }));
vi.mock("@nutri-bot/db", () => ({ prisma: {} }));
vi.mock("@nutri-bot/db/domain", () => ({
  reconcilePendingPayments: mocks.reconcile, expireStalePendingPayments: mocks.expire,
  enqueueServiceReminders: mocks.serviceReminders,
  enqueuePrepInstructions: mocks.prep, syncGoogleCalendar: mocks.gcal,
  enqueueAfterHoursDigest: mocks.digest,
  purgeExpiredBotAiQuestions: mocks.purge,
  clearExpiredSessionText: mocks.clearSessions,
}));
vi.mock("./ai/runtime", () => ({ getBotAiConfig: () => ({ limits: { retentionDays: 90 } }) }));
vi.mock("./whatsapp", () => ({ sendDocument: vi.fn(), sendText: vi.fn() }));
vi.mock("./outbound-payload", () => ({ OUTBOX_INCLUDE: {}, resolveOutboundPayload: vi.fn() }));
vi.mock("./env", () => ({ env: { pollIntervalMs: 4000 } }));
vi.mock("./logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: mocks.error } }));
import { runServiceReminders, runStartupJobs, startCron } from "./workers";

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
