// HU-013: motivo de consulta en createAppointment / updateAppointmentReason (prisma mockeado).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@nutri-bot/core";

const mocks = vi.hoisted(() => ({
  getProfessional: vi.fn(),
  checkSlotAvailable: vi.fn(),
  enqueueMessage: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    service: { findUniqueOrThrow: vi.fn() },
    patient: { findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
    appointment: { create: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
    consultation: { create: vi.fn(), deleteMany: vi.fn() },
    outboundMessage: { deleteMany: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    conversationState: { updateMany: vi.fn() },
  },
}));

vi.mock("../index", () => ({
  prisma: mocks.prisma,
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
vi.mock("./availability", async (importOriginal) => ({
  // HU-022: canRescheduleAppointment es pura; corre la real.
  canRescheduleAppointment: (await importOriginal<typeof import("./availability")>()).canRescheduleAppointment,
  getProfessional: mocks.getProfessional,
  checkSlotAvailable: mocks.checkSlotAvailable,
}));
vi.mock("./outbox", () => ({ enqueueMessage: mocks.enqueueMessage }));

import {
  createAppointment,
  InvalidBookingReasonError,
  RescheduleError,
  rescheduleAppointment,
  setAppointmentStatus,
  SlotUnavailableError,
  updateAppointmentReason,
} from "./appointments";

const TZ = "America/Argentina/Buenos_Aires";
const STARTS = new Date("2026-10-12T13:00:00Z");
const SERVICE = { id: "s1", name: "Primera consulta", durationMin: 30, price: 25000, requiresDeposit: false, depositKind: "FIXED", depositValue: 5000 };
const PATIENT = { id: "p1", name: "Ana (TEST)", phone: "5490000000031", whatsappJid: "5490000000031@s.whatsapp.net" };

const base = { patientId: "p1", serviceId: "s1", startsAt: STARTS };

function createData() {
  return mocks.prisma.appointment.create.mock.calls[0]![0].data;
}
function enqueued(kind: string) {
  return mocks.enqueueMessage.mock.calls.map((c) => c[0]).filter((m) => m.kind === kind);
}

describe("createAppointment con motivo (HU-013)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
    mocks.getProfessional.mockResolvedValue({ timezone: TZ, phoneJid: "pro@s.whatsapp.net" });
    mocks.checkSlotAvailable.mockResolvedValue(true);
    mocks.prisma.service.findUniqueOrThrow.mockResolvedValue(SERVICE);
    mocks.prisma.patient.findUniqueOrThrow.mockResolvedValue(PATIENT);
    mocks.prisma.appointment.create.mockImplementation(async ({ data }: { data: any }) => ({
      id: "a1",
      startsAt: data.startsAt,
      reason: data.reason,
      status: data.status,
    }));
  });

  it("guarda el motivo normalizado y sigue marcando needsGoogleSync", async () => {
    await createAppointment({ ...base, createdBy: "PATIENT", notifyPatient: false, reason: "  Bajar de peso  " });
    expect(createData().reason).toBe("Bajar de peso");
    expect(createData().needsGoogleSync).toBe(true);
  });

  it.each([{ reason: "   " }, {}])("vacío o ausente → null (%j)", async (extra) => {
    await createAppointment({ ...base, createdBy: "PATIENT", notifyPatient: false, ...extra });
    expect(createData().reason).toBeNull();
  });

  it("más de 500 → InvalidBookingReasonError sin leer ni escribir", async () => {
    await expect(
      createAppointment({ ...base, createdBy: "PATIENT", reason: "a".repeat(501) }),
    ).rejects.toBeInstanceOf(InvalidBookingReasonError);
    expect(mocks.prisma.appointment.create).not.toHaveBeenCalled();
    expect(mocks.prisma.service.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });

  it("la alerta de turno nuevo lleva el motivo (sin seña)", async () => {
    await createAppointment({ ...base, createdBy: "PATIENT", notifyPatient: false, reason: "Bajar de peso" });
    const alerts = enqueued("PROFESSIONAL_ALERT");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].toJid).toBe("pro@s.whatsapp.net");
    expect(alerts[0].body).toContain("📝 Motivo: Bajar de peso");
  });

  it("sin motivo la alerta es la de siempre", async () => {
    await createAppointment({ ...base, createdBy: "PATIENT", notifyPatient: false, reason: null });
    const alerts = enqueued("PROFESSIONAL_ALERT");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].body).toBe(
      messages.professionalNewBookingAlert({
        patientName: PATIENT.name,
        patientPhone: PATIENT.phone,
        serviceName: SERVICE.name,
        startsAt: STARTS,
        tz: TZ,
      }),
    );
  });

  it("professionalAlertJid reemplaza el destino; null apaga la alerta", async () => {
    await createAppointment({
      ...base,
      createdBy: "PATIENT",
      notifyPatient: false,
      reason: "Control",
      professionalAlertJid: "fake@s.whatsapp.net",
    });
    expect(enqueued("PROFESSIONAL_ALERT").map((m) => m.toJid)).toEqual(["fake@s.whatsapp.net"]);

    mocks.enqueueMessage.mockClear();
    await createAppointment({
      ...base,
      createdBy: "PATIENT",
      notifyPatient: false,
      reason: "Control",
      professionalAlertJid: null,
    });
    expect(enqueued("PROFESSIONAL_ALERT")).toHaveLength(0);
  });

  it("con seña guarda el motivo y no avisa todavía", async () => {
    mocks.prisma.service.findUniqueOrThrow.mockResolvedValue({ ...SERVICE, requiresDeposit: true });
    await createAppointment({ ...base, createdBy: "PATIENT", notifyPatient: false, reason: "Control" });
    expect(createData().status).toBe("AWAITING_PAYMENT");
    expect(createData().reason).toBe("Control");
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });

  it("desde el panel guarda el motivo, confirma al paciente sin motivo y no alerta", async () => {
    await createAppointment({ ...base, createdBy: "PROFESSIONAL", reason: "Control mensual" });
    expect(createData().reason).toBe("Control mensual");
    expect(mocks.enqueueMessage).toHaveBeenCalledTimes(1);
    const msg = mocks.enqueueMessage.mock.calls[0]![0];
    expect(msg.kind).toBe("CONFIRMATION");
    expect(msg.body).not.toContain("Motivo");
  });
});

describe("updateAppointmentReason (HU-013, D5)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.appointment.update.mockImplementation(async ({ data }: { data: any }) => ({
      id: "a1",
      patientId: "p1",
      reason: data.reason,
    }));
  });

  it("actualiza solo el motivo normalizado", async () => {
    const r = await updateAppointmentReason({ id: "a1", reason: "  Nuevo motivo " });
    expect(mocks.prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { reason: "Nuevo motivo" },
      select: { id: true, patientId: true, reason: true },
    });
    expect(r).toEqual({ id: "a1", patientId: "p1", reason: "Nuevo motivo" });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });

  it("vacío → null", async () => {
    await updateAppointmentReason({ id: "a1", reason: "" });
    expect(mocks.prisma.appointment.update.mock.calls[0]![0].data).toEqual({ reason: null });
  });

  it("más de 500 → error sin escribir", async () => {
    await expect(updateAppointmentReason({ id: "a1", reason: "a".repeat(501) })).rejects.toBeInstanceOf(
      InvalidBookingReasonError,
    );
    expect(mocks.prisma.appointment.update).not.toHaveBeenCalled();
  });
});

describe("createAppointment sella bookedAt (HU-014, D5)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
    mocks.getProfessional.mockResolvedValue({ timezone: TZ, phoneJid: "pro@s.whatsapp.net" });
    mocks.checkSlotAvailable.mockResolvedValue(true);
    mocks.prisma.service.findUniqueOrThrow.mockResolvedValue(SERVICE);
    mocks.prisma.patient.findUniqueOrThrow.mockResolvedValue(PATIENT);
    mocks.prisma.appointment.create.mockImplementation(async ({ data }: { data: any }) => ({
      id: "a1",
      startsAt: data.startsAt,
      reason: data.reason,
      status: data.status,
    }));
  });

  it("sin seña → bookedAt es el momento de la reserva", async () => {
    const before = Date.now();
    await createAppointment({ ...base, createdBy: "PATIENT", notifyPatient: false });
    const data = createData();
    expect(data.status).toBe("CONFIRMED");
    expect(data.bookedAt).toBeInstanceOf(Date);
    expect(data.bookedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(data.bookedAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("con seña (paciente + requiresDeposit) → bookedAt null", async () => {
    mocks.prisma.service.findUniqueOrThrow.mockResolvedValue({ ...SERVICE, requiresDeposit: true });
    await createAppointment({ ...base, createdBy: "PATIENT", notifyPatient: false });
    const data = createData();
    expect(data.status).toBe("AWAITING_PAYMENT");
    expect(data.bookedAt).toBeNull();
  });

  it("desde el panel con un servicio con seña → confirmado y sellado", async () => {
    mocks.prisma.service.findUniqueOrThrow.mockResolvedValue({ ...SERVICE, requiresDeposit: true });
    await createAppointment({ ...base, createdBy: "PROFESSIONAL", notifyPatient: false });
    expect(createData().bookedAt).toBeInstanceOf(Date);
  });
});

describe("reservar desarchiva (HU-019, T4/T5)", () => {
  const UNARCHIVE = { where: { id: "p1", archivedAt: { not: null } }, data: { archivedAt: null } };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
    mocks.getProfessional.mockResolvedValue({ timezone: TZ, phoneJid: "pro@s.whatsapp.net" });
    mocks.checkSlotAvailable.mockResolvedValue(true);
    mocks.prisma.service.findUniqueOrThrow.mockResolvedValue(SERVICE);
    mocks.prisma.patient.findUniqueOrThrow.mockResolvedValue(PATIENT);
    mocks.prisma.patient.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.appointment.create.mockImplementation(async ({ data }: { data: any }) => ({
      id: "a1",
      startsAt: data.startsAt,
      reason: data.reason,
      status: data.status,
    }));
  });

  it.each(["PROFESSIONAL", "PATIENT"] as const)("createAppointment (%s) desarchiva dentro de la transacción", async (createdBy) => {
    const appt = await createAppointment({ ...base, createdBy, notifyPatient: false });
    expect(appt.id).toBe("a1");
    expect(mocks.prisma.patient.updateMany).toHaveBeenCalledWith(UNARCHIVE);
    expect(mocks.prisma.appointment.create.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prisma.patient.updateMany.mock.invocationCallOrder[0]!,
    );
  });

  it("con seña (AWAITING_PAYMENT) también desarchiva", async () => {
    mocks.prisma.service.findUniqueOrThrow.mockResolvedValue({ ...SERVICE, requiresDeposit: true });
    await createAppointment({ ...base, createdBy: "PATIENT", notifyPatient: false });
    expect(createData().status).toBe("AWAITING_PAYMENT");
    expect(mocks.prisma.patient.updateMany).toHaveBeenCalledWith(UNARCHIVE);
  });

  it("horario no disponible → SlotUnavailableError sin desarchivar", async () => {
    mocks.checkSlotAvailable.mockResolvedValue(false);
    await expect(createAppointment({ ...base, createdBy: "PROFESSIONAL" })).rejects.toBeInstanceOf(SlotUnavailableError);
    expect(mocks.prisma.patient.updateMany).not.toHaveBeenCalled();
  });

  describe("setAppointmentStatus", () => {
    function prevAppt(startsAt: Date, status = "NO_SHOW") {
      return { id: "a1", patientId: "p1", startsAt, status, consultation: null };
    }
    beforeEach(() => {
      mocks.prisma.appointment.update.mockImplementation(async ({ data }: { data: any }) => ({ id: "a1", status: data.status }));
      mocks.prisma.consultation.create.mockResolvedValue({ id: "c1" });
    });

    it("a CONFIRMED con turno futuro → desarchiva", async () => {
      mocks.prisma.appointment.findUniqueOrThrow.mockResolvedValue(prevAppt(new Date(Date.now() + 86_400_000)));
      await setAppointmentStatus({ id: "a1", status: "CONFIRMED" });
      expect(mocks.prisma.patient.updateMany).toHaveBeenCalledWith(UNARCHIVE);
    });

    it("a CONFIRMED con turno pasado → no desarchiva", async () => {
      mocks.prisma.appointment.findUniqueOrThrow.mockResolvedValue(prevAppt(new Date(Date.now() - 86_400_000)));
      await setAppointmentStatus({ id: "a1", status: "CONFIRMED" });
      expect(mocks.prisma.patient.updateMany).not.toHaveBeenCalled();
    });

    it.each(["COMPLETED", "NO_SHOW"] as const)("a %s (turno futuro) → no desarchiva", async (status) => {
      mocks.prisma.appointment.findUniqueOrThrow.mockResolvedValue(
        prevAppt(new Date(Date.now() + 86_400_000), "CONFIRMED"),
      );
      await setAppointmentStatus({ id: "a1", status });
      expect(mocks.prisma.patient.updateMany).not.toHaveBeenCalled();
    });
  });
});

describe("rescheduleAppointment (HU-022)", () => {
  const NOW = new Date("2026-11-01T12:00:00Z");
  const OLD_START = new Date("2026-11-05T13:00:00Z");
  const NEW_START = new Date("2026-11-06T15:00:00Z");
  const OLD_ISO = OLD_START.toISOString();
  // 45 min aunque el servicio dure 30: se conserva la duración del turno.
  const APPT = {
    id: "a1",
    patientId: "p1",
    serviceId: "s1",
    status: "CONFIRMED",
    startsAt: OLD_START,
    endsAt: new Date(OLD_START.getTime() + 45 * 60_000),
    bookedAt: new Date("2026-10-20T12:00:00Z"),
    patient: PATIENT,
    service: SERVICE,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
    mocks.getProfessional.mockResolvedValue({ timezone: TZ, phoneJid: "pro@s.whatsapp.net" });
    mocks.checkSlotAvailable.mockResolvedValue(true);
    mocks.prisma.appointment.findUnique.mockResolvedValue(APPT);
    mocks.prisma.appointment.update.mockImplementation(async ({ data }: { data: any }) => ({ ...APPT, ...data }));
    mocks.prisma.outboundMessage.findMany.mockResolvedValue([]);
    mocks.enqueueMessage.mockResolvedValue(true);
  });

  async function expectCode(code: string, params = { id: "a1", startsAt: NEW_START, now: NOW }) {
    const err = await rescheduleAppointment(params).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RescheduleError);
    expect((err as InstanceType<typeof RescheduleError>).code).toBe(code);
  }
  function expectNothingChanged() {
    expect(mocks.prisma.appointment.update).not.toHaveBeenCalled();
    expect(mocks.prisma.outboundMessage.deleteMany).not.toHaveBeenCalled();
    expect(mocks.prisma.outboundMessage.update).not.toHaveBeenCalled();
    expect(mocks.prisma.conversationState.updateMany).not.toHaveBeenCalled();
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  }

  it.each([
    ["COMPLETED", OLD_START],
    ["NO_SHOW", OLD_START],
    ["CANCELLED", OLD_START],
    ["CONFIRMED", new Date("2026-11-01T11:00:00Z")], // ya pasó
  ])("S5: turno %s (%s) → NOT_RESCHEDULABLE sin tocar nada", async (status, startsAt) => {
    mocks.prisma.appointment.findUnique.mockResolvedValue({ ...APPT, status, startsAt });
    await expectCode("NOT_RESCHEDULABLE");
    expect(mocks.checkSlotAvailable).not.toHaveBeenCalled();
    expectNothingChanged();
  });

  it("S5: turno inexistente → NOT_RESCHEDULABLE", async () => {
    mocks.prisma.appointment.findUnique.mockResolvedValue(null);
    await expectCode("NOT_RESCHEDULABLE");
    expectNothingChanged();
  });

  it("S4: revalida en la transacción con el lock compartido, excluyendo el propio turno; ocupado → SLOT_TAKEN sin cambios", async () => {
    mocks.checkSlotAvailable.mockResolvedValue(false);
    await expectCode("SLOT_TAKEN");
    expect(mocks.checkSlotAvailable).toHaveBeenCalledWith(
      { serviceId: "s1", startsAt: NEW_START, excludeAppointmentId: "a1", now: NOW },
      mocks.prisma,
    );
    expect(mocks.prisma.$queryRaw.mock.calls[0]![0].join("?")).toContain('"Professional" WHERE id = 1 FOR UPDATE');
    expect(mocks.prisma.$queryRaw.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.prisma.appointment.findUnique.mock.invocationCallOrder[0]!,
    );
    expectNothingChanged();
  });

  it("mismo horario → SAME_TIME sin cambios", async () => {
    await expectCode("SAME_TIME", { id: "a1", startsAt: new Date(OLD_START), now: NOW });
    expectNothingChanged();
  });

  it("S6: conserva la duración, resincroniza Google, reinicia la confirmación y sella bookedAt", async () => {
    const updated = await rescheduleAppointment({ id: "a1", startsAt: NEW_START, now: NOW });
    expect(mocks.prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: {
        startsAt: NEW_START,
        endsAt: new Date(NEW_START.getTime() + 45 * 60_000),
        needsGoogleSync: true,
        confirmationRequestedAt: null,
        confirmationRespondedAt: null,
        confirmationResponse: null,
        bookedAt: NOW,
      },
    });
    expect(updated.startsAt).toEqual(NEW_START);
  });

  it("S5/S6: AWAITING_PAYMENT se reprograma sin sellar bookedAt (lo sella el pago)", async () => {
    mocks.prisma.appointment.findUnique.mockResolvedValue({ ...APPT, status: "AWAITING_PAYMENT", bookedAt: null });
    await rescheduleAppointment({ id: "a1", startsAt: NEW_START, now: NOW });
    const { data } = mocks.prisma.appointment.update.mock.calls[0]![0];
    expect(data).not.toHaveProperty("bookedAt");
    expect(data.startsAt).toEqual(NEW_START);
  });

  it("S6: borra los recordatorios/pedidos pendientes del horario viejo y marca prev: los ya enviados", async () => {
    mocks.prisma.outboundMessage.findMany.mockResolvedValue([
      { id: "m1", dedupeKey: "auto:24h" },
      { id: "m2", dedupeKey: "" },
    ]);
    await rescheduleAppointment({ id: "a1", startsAt: NEW_START, now: NOW });
    expect(mocks.prisma.outboundMessage.deleteMany).toHaveBeenCalledWith({
      where: { appointmentId: "a1", kind: { in: ["REMINDER", "CONFIRMATION_REQUEST"] }, status: "PENDING" },
    });
    expect(mocks.prisma.outboundMessage.findMany).toHaveBeenCalledWith({
      where: {
        appointmentId: "a1",
        kind: { in: ["REMINDER", "CONFIRMATION_REQUEST"] },
        status: { not: "PENDING" },
        NOT: { dedupeKey: { startsWith: "prev:" } },
      },
      select: { id: true, dedupeKey: true },
    });
    expect(mocks.prisma.outboundMessage.update.mock.calls.map((c) => c[0])).toEqual([
      { where: { id: "m1" }, data: { dedupeKey: `prev:${OLD_ISO}:m1:auto:24h` } },
      { where: { id: "m2" }, data: { dedupeKey: `prev:${OLD_ISO}:m2:` } },
    ]);
  });

  it("S6: si la paciente quedó respondiendo la confirmación de ESTE turno, se reinicia esa conversación", async () => {
    await rescheduleAppointment({ id: "a1", startsAt: NEW_START, now: NOW });
    expect(mocks.prisma.conversationState.updateMany).toHaveBeenCalledWith({
      where: { patientJid: PATIENT.whatsappJid, step: "CONFIRM_ATTENDANCE", context: { path: ["apptId"], equals: "a1" } },
      data: { step: "DORMANT", context: {} },
    });
  });

  it("S7: encola un AD_HOC a la paciente con el día y la hora nuevos, después de la transacción", async () => {
    await rescheduleAppointment({ id: "a1", startsAt: NEW_START, now: NOW });
    expect(mocks.enqueueMessage).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueMessage).toHaveBeenCalledWith({
      toJid: PATIENT.whatsappJid,
      kind: "AD_HOC",
      appointmentId: "a1",
      dedupeKey: `reschedule:${NOW.toISOString()}`,
      body: messages.rescheduledNotice({ serviceName: SERVICE.name, startsAt: NEW_START, tz: TZ }),
    });
    expect(mocks.enqueueMessage.mock.invocationCallOrder[0]!).toBeGreaterThan(
      mocks.prisma.appointment.update.mock.invocationCallOrder[0]!,
    );
  });
});
