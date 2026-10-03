import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  prisma: {
    $transaction: vi.fn(), $queryRaw: vi.fn(),
    professional: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    service: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
    patient: { findUniqueOrThrow: vi.fn() },
    availabilityRule: { findMany: vi.fn() }, availabilityException: { findMany: vi.fn() },
    appointment: { findMany: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("../index", () => ({ prisma: mocks.prisma, Prisma: {} }));
vi.mock("./outbox", () => ({ enqueueMessage: mocks.enqueue }));
import { createAppointment, SlotUnavailableError } from "./appointments";
import { checkSlotAvailable } from "./availability";

describe("booking with the existing availability domain", () => {
  let service: any;
  let appointments: any[];
  const params = { patientId: "patient", serviceId: "service", startsAt: new Date("2026-10-05T15:00:00Z"), createdBy: "PATIENT" as const };
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    service = { id: "service", name: "Consultation", active: true, durationMin: 30, price: 10000, requiresDeposit: false, depositKind: null, depositValue: null };
    appointments = [];
    const pro = { timezone: "America/Argentina/Buenos_Aires", phoneJid: "fake-pro" };
    mocks.prisma.professional.findUnique.mockResolvedValue(pro);
    mocks.prisma.professional.findUniqueOrThrow.mockResolvedValue(pro);
    mocks.prisma.service.findUniqueOrThrow.mockImplementation(async () => service);
    mocks.prisma.service.findUnique.mockImplementation(async () => service);
    mocks.prisma.patient.findUniqueOrThrow.mockResolvedValue({ whatsappJid: "fake-patient", name: "Test", phone: "fake" });
    mocks.prisma.availabilityRule.findMany.mockResolvedValue([{ weekday: 1, startTime: "09:00", endTime: "18:00", active: true }]);
    mocks.prisma.availabilityException.findMany.mockResolvedValue([]);
    mocks.prisma.appointment.findMany.mockImplementation(async () => appointments.filter((a) => ["CONFIRMED", "AWAITING_PAYMENT"].includes(a.status)));
    mocks.prisma.appointment.create.mockImplementation(async ({ data }) => {
      const appointment = { id: `appointment-${appointments.length}`, ...data };
      appointments.push(appointment);
      return appointment;
    });
    // Model transactions acquiring the shared calendar lock, without a real DB.
    let previous: Promise<unknown> = Promise.resolve();
    mocks.prisma.$transaction.mockImplementation((fn) => {
      const next = previous.then(() => fn(mocks.prisma));
      previous = next.catch(() => {});
      return next;
    });
  });
  afterEach(() => vi.useRealTimers());

  it("confirms a service without a deposit and enqueues normal notifications", async () => {
    const appointment = await createAppointment(params);
    expect(appointment.status).toBe("CONFIRMED");
    expect(appointment.needsGoogleSync).toBe(true);
    expect(mocks.enqueue).toHaveBeenCalledTimes(2);
  });

  it("holds a deposit reservation without confirming or syncing Google", async () => {
    Object.assign(service, { requiresDeposit: true, depositKind: "PERCENT", depositValue: 30 });
    const appointment = await createAppointment(params);
    expect(appointment.status).toBe("AWAITING_PAYMENT");
    expect(appointment.needsGoogleSync).toBe(false);
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(await checkSlotAvailable(params)).toBe(false);
    appointment.status = "CANCELLED";
    expect(await checkSlotAvailable(params)).toBe(true);
  });

  it.each([null, 0, NaN, 101])("rejects invalid percent value %s before creating an appointment", async (depositValue) => {
    Object.assign(service, { requiresDeposit: true, depositKind: "PERCENT", depositValue });
    await expect(createAppointment(params)).rejects.toThrow("seña válida");
    expect(mocks.prisma.appointment.create).not.toHaveBeenCalled();
  });

  it("rejects a missing deposit kind", async () => {
    Object.assign(service, { requiresDeposit: true, depositValue: 30 });
    await expect(createAppointment(params)).rejects.toThrow("seña válida");
    expect(mocks.prisma.appointment.create).not.toHaveBeenCalled();
  });

  it("allows only one of two patients competing for the same slot", async () => {
    const results = await Promise.allSettled([createAppointment(params), createAppointment({ ...params, patientId: "other-patient" })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: expect.any(SlotUnavailableError) });
    expect(mocks.prisma.appointment.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.$queryRaw.mock.calls[0]?.[0].join("")).toContain('FROM "Professional" WHERE id = 1 FOR UPDATE');
    expect(mocks.prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.prisma.appointment.findMany.mock.invocationCallOrder[0]!);
  });
});
