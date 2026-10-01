import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ schedule: vi.fn(), reconcile: vi.fn(), expire: vi.fn(), error: vi.fn() }));
vi.mock("node-cron", () => ({ default: { schedule: mocks.schedule } }));
vi.mock("@nutri-bot/db", () => ({ prisma: {} }));
vi.mock("@nutri-bot/db/domain", () => ({
  reconcilePendingPayments: mocks.reconcile, expireStalePendingPayments: mocks.expire,
  enqueueDueReminders: vi.fn(), enqueueAttendanceConfirmations: vi.fn(),
  enqueuePrepInstructions: vi.fn(), syncGoogleCalendar: vi.fn(),
}));
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
