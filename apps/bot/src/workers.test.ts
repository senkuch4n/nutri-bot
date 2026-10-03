import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ schedule: vi.fn(), reconcile: vi.fn(), expire: vi.fn(), error: vi.fn(), digest: vi.fn(), purge: vi.fn() }));
vi.mock("node-cron", () => ({ default: { schedule: mocks.schedule } }));
vi.mock("@nutri-bot/db", () => ({ prisma: {} }));
vi.mock("@nutri-bot/db/domain", () => ({
  reconcilePendingPayments: mocks.reconcile, expireStalePendingPayments: mocks.expire,
  enqueueDueReminders: vi.fn(), enqueueAttendanceConfirmations: vi.fn(),
  enqueuePrepInstructions: vi.fn(), syncGoogleCalendar: vi.fn(),
  enqueueAfterHoursDigest: mocks.digest,
  purgeExpiredBotAiQuestions: mocks.purge,
}));
vi.mock("./ai/runtime", () => ({ getBotAiConfig: () => ({ limits: { retentionDays: 90 } }) }));
vi.mock("./whatsapp", () => ({ sendDocument: vi.fn(), sendText: vi.fn() }));
vi.mock("./outbound-payload", () => ({ OUTBOX_INCLUDE: {}, resolveOutboundPayload: vi.fn() }));
vi.mock("./env", () => ({ env: { pollIntervalMs: 4000 } }));
vi.mock("./logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: mocks.error } }));
import { startCron } from "./workers";

describe("payment cron without Baileys or database", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    mocks.reconcile.mockResolvedValue({ processed: 1, failed: 0 });
  });
  it("reconciles every minute before the five-minute expiration", async () => {
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
