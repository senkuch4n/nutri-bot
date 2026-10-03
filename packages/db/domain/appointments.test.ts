// HU-013: motivo de consulta en createAppointment / updateAppointmentReason (prisma mockeado).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@nutri-bot/core";

const mocks = vi.hoisted(() => ({
  getProfessional: vi.fn(),
  checkSlotAvailable: vi.fn(),
  enqueueMessage: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    service: { findUniqueOrThrow: vi.fn() },
    patient: { findUniqueOrThrow: vi.fn() },
    appointment: { create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../index", () => ({
  prisma: mocks.prisma,
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
vi.mock("./availability", () => ({
  getProfessional: mocks.getProfessional,
  checkSlotAvailable: mocks.checkSlotAvailable,
}));
vi.mock("./outbox", () => ({ enqueueMessage: mocks.enqueueMessage }));

import { createAppointment, InvalidBookingReasonError, updateAppointmentReason } from "./appointments";

const TZ = "America/Argentina/Buenos_Aires";
const STARTS = new Date("2026-10-12T13:00:00Z");
const SERVICE = { id: "s1", name: "Primera consulta", durationMin: 30, price: 25000, requiresDeposit: false };
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
