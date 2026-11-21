// HU-013: motivo de consulta en createAppointment / updateAppointmentReason (prisma mockeado).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@nutri-bot/core";
import { Prisma } from "../index";

const mocks = vi.hoisted(() => ({
  getProfessional: vi.fn(),
  checkSlotAvailable: vi.fn(),
  enqueueMessage: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    agenda: { findUnique: vi.fn() },
    service: { findUnique: vi.fn() },
    patient: { findUnique: vi.fn(), updateMany: vi.fn() },
    appointment: { create: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
    consultation: { create: vi.fn(), deleteMany: vi.fn() },
    outboundMessage: { deleteMany: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    conversationState: { updateMany: vi.fn(), deleteMany: vi.fn() },
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
  cancelAppointment,
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

function mockLegacyAgenda() {
  mocks.prisma.agenda.findUnique.mockResolvedValue({ professional: { timezone: TZ, phoneJid: "pro@s.whatsapp.net" } });
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
    mockLegacyAgenda();
    mocks.prisma.service.findUnique.mockResolvedValue(SERVICE);
    mocks.prisma.patient.findUnique.mockResolvedValue(PATIENT);
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
    expect(mocks.prisma.service.findUnique).not.toHaveBeenCalled();
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });

  it("la alerta de turno nuevo lleva el motivo (sin seña)", async () => {
    await createAppointment({ ...base, createdBy: "PATIENT", notifyPatient: false, reason: "Bajar de peso" });
    const alerts = enqueued("PROFESSIONAL_ALERT");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ toJid: "pro@s.whatsapp.net", verifiedTenantId: "legacy-tenant" });
    expect(alerts[0]).not.toHaveProperty("appointmentId");
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
    mocks.prisma.service.findUnique.mockResolvedValue({ ...SERVICE, requiresDeposit: true });
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

describe("cancelAppointment en la agenda original", () => {
  const scope = { tenantId: "legacy-tenant", agendaId: "legacy-agenda" };
  const appt = {
    ...scope, id: "a1", patientId: PATIENT.id, serviceId: SERVICE.id, startsAt: STARTS,
    status: "CONFIRMED", patient: { ...PATIENT, tenantId: scope.tenantId },
    service: { ...SERVICE, tenantId: scope.tenantId },
  };
  const params = { id: appt.id, by: "PATIENT" as const, notifyPatient: false };
  let row: typeof appt;

  beforeEach(() => {
    vi.resetAllMocks();
    row = { ...appt };
    mockLegacyAgenda();
    mocks.getProfessional.mockResolvedValue({ timezone: TZ, phoneJid: "pro@s.whatsapp.net" });
    mocks.prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
    mocks.prisma.appointment.findUniqueOrThrow.mockImplementation(async ({ where }: { where: Partial<typeof scope> }) => {
      if ((where.tenantId && row.tenantId !== where.tenantId) || (where.agendaId && row.agendaId !== where.agendaId)) {
        throw new Error("Turno inexistente");
      }
      return row;
    });
    mocks.prisma.appointment.update.mockImplementation(async ({ data }: { data: object }) => ({ ...row, ...data }));
  });

  it.each([{ tenantId: "otro", agendaId: "otra" }, { agendaId: "otra" }])("rechaza turno fuera de alcance (%j)", async (foreign) => {
    row = { ...row, ...foreign };
    await expect(cancelAppointment(params)).rejects.toThrow("Turno inexistente");
    expect(mocks.prisma.appointment.update).not.toHaveBeenCalled();
    expect(mocks.prisma.conversationState.deleteMany).not.toHaveBeenCalled();
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });

  it("no usa una paciente ajena para avisos o estado aunque el turno parezca propio", async () => {
    row = { ...row, patient: { ...row.patient, tenantId: "otro" } };
    await expect(cancelAppointment(params)).rejects.toThrow();
    expect(mocks.prisma.appointment.update).not.toHaveBeenCalled();
    expect(mocks.prisma.conversationState.deleteMany).not.toHaveBeenCalled();
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });

  it("cancela, conserva el motivo, limpia solo el estado del turno y encola el aviso profesional atribuido", async () => {
    const reason = "Avisó que no puede asistir";
    const data = { status: "CANCELLED", cancelledBy: "PATIENT", cancelReason: reason, needsGoogleSync: true };
    await expect(cancelAppointment({ ...params, reason })).resolves.toMatchObject(data);
    expect(mocks.prisma.appointment.update).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: appt.id, ...scope, status: "CONFIRMED", patientId: PATIENT.id, serviceId: SERVICE.id }), data,
    });
    expect(mocks.prisma.conversationState.deleteMany).toHaveBeenCalledWith({ where: {
      patientJid: PATIENT.whatsappJid, tenantId: "legacy-tenant", step: { in: ["CANCEL_CONFIRM", "CONFIRM_ATTENDANCE"] },
      context: { path: ["apptId"], equals: appt.id },
    } });
    expect(mocks.enqueueMessage.mock.calls).toEqual([[{
      toJid: "pro@s.whatsapp.net", kind: "PROFESSIONAL_ALERT", verifiedTenantId: scope.tenantId,
      body: messages.professionalCancelAlert({ patientName: PATIENT.name, patientPhone: PATIENT.phone, serviceName: SERVICE.name, startsAt: STARTS, tz: TZ }),
    }]]);
  });

  it("conserva el aviso a la paciente para cancelaciones desde el panel", async () => {
    await expect(cancelAppointment({ id: appt.id, by: "PROFESSIONAL" })).resolves.toMatchObject({
      status: "CANCELLED", cancelledBy: "PROFESSIONAL", cancelReason: null, needsGoogleSync: true,
    });
    expect(mocks.enqueueMessage.mock.calls).toEqual([[{
      toJid: PATIENT.whatsappJid, kind: "CANCELLATION", appointmentId: appt.id,
      body: messages.cancelDone({ serviceName: SERVICE.name, startsAt: STARTS, tz: TZ }),
    }]]);
  });

  it("no muta ni avisa si ya no está confirmado", async () => {
    row = { ...row, status: "AWAITING_PAYMENT" };
    await expect(cancelAppointment(params)).resolves.toEqual(row);
    expect(mocks.prisma.appointment.update).not.toHaveBeenCalled();
    expect(mocks.prisma.conversationState.deleteMany).not.toHaveBeenCalled();
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });

  it("no limpia estado ni avisa si falla la escritura condicional", async () => {
    mocks.prisma.appointment.update.mockRejectedValue(new Error("Turno modificado"));
    await expect(cancelAppointment(params)).rejects.toThrow("Turno modificado");
    expect(mocks.prisma.conversationState.deleteMany).not.toHaveBeenCalled();
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });
});

describe("updateAppointmentReason (HU-013, D5)", () => {
  const scope = { tenantId: "legacy-tenant", agendaId: "legacy-agenda" };

  beforeEach(() => {
    vi.resetAllMocks();
    mockLegacyAgenda();
    mocks.prisma.appointment.update.mockImplementation(async ({ data }: { data: any }) => ({
      id: "a1",
      patientId: "p1",
      reason: data.reason,
    }));
  });

  it("actualiza solo el motivo normalizado", async () => {
    const r = await updateAppointmentReason({ id: "a1", reason: "  Nuevo motivo " });
    expect(mocks.prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "a1", ...scope },
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

  it.each([{ tenantId: "otro" }, { agendaId: "otra" }])("no cambia el motivo de un turno fuera de alcance (%j)", async (over) => {
    const row = { id: "a1", ...scope, ...over, reason: "Anterior" };
    mocks.prisma.appointment.update.mockImplementation(async ({ where, data }: {
      where: Partial<typeof row>; data: { reason: string };
    }) => {
      if (Object.entries(where).some(([key, value]) => row[key as keyof typeof row] !== value)) {
        throw new Error("Turno inexistente");
      }
      row.reason = data.reason;
      return row;
    });
    await expect(updateAppointmentReason({ id: "a1", reason: "Nuevo" })).rejects.toThrow("Turno inexistente");
    expect(row.reason).toBe("Anterior");
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
    expect(mocks.prisma.consultation.create).not.toHaveBeenCalled();
    expect(mocks.prisma.consultation.deleteMany).not.toHaveBeenCalled();
  });

  it("no escribe sin verificar la agenda original", async () => {
    mocks.prisma.agenda.findUnique.mockResolvedValue(null);
    await expect(updateAppointmentReason({ id: "a1", reason: "Nuevo" }))
      .rejects.toThrow("No se pudo verificar la agenda de la instalación original.");
    expect(mocks.prisma.appointment.update).not.toHaveBeenCalled();
  });

  it("más de 500 → error sin leer ni escribir", async () => {
    await expect(updateAppointmentReason({ id: "a1", reason: "a".repeat(501) })).rejects.toBeInstanceOf(
      InvalidBookingReasonError,
    );
    expect(mocks.prisma.agenda.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.appointment.update).not.toHaveBeenCalled();
  });
});

describe("createAppointment sella bookedAt (HU-014, D5)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
    mocks.getProfessional.mockResolvedValue({ timezone: TZ, phoneJid: "pro@s.whatsapp.net" });
    mocks.checkSlotAvailable.mockResolvedValue(true);
    mockLegacyAgenda();
    mocks.prisma.service.findUnique.mockResolvedValue(SERVICE);
    mocks.prisma.patient.findUnique.mockResolvedValue(PATIENT);
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
    mocks.prisma.service.findUnique.mockResolvedValue({ ...SERVICE, requiresDeposit: true });
    await createAppointment({ ...base, createdBy: "PATIENT", notifyPatient: false });
    const data = createData();
    expect(data.status).toBe("AWAITING_PAYMENT");
    expect(data.bookedAt).toBeNull();
  });

  it("desde el panel con un servicio con seña → confirmado y sellado", async () => {
    mocks.prisma.service.findUnique.mockResolvedValue({ ...SERVICE, requiresDeposit: true });
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
    mockLegacyAgenda();
    mocks.prisma.service.findUnique.mockResolvedValue(SERVICE);
    mocks.prisma.patient.findUnique.mockResolvedValue(PATIENT);
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
    mocks.prisma.service.findUnique.mockResolvedValue({ ...SERVICE, requiresDeposit: true });
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
      return { id: "a1", patientId: "p1", tenantId: "legacy-tenant", agendaId: "legacy-agenda", startsAt, status, consultation: null };
    }
    beforeEach(() => {
      mocks.prisma.appointment.update.mockImplementation(async ({ data }: { data: any }) => ({ id: "a1", status: data.status }));
      mocks.prisma.consultation.create.mockResolvedValue({ id: "c1" });
      mocks.prisma.consultation.deleteMany.mockResolvedValue({ count: 1 });
    });

    const scopedAppointment = { id: "a1", tenantId: "legacy-tenant", agendaId: "legacy-agenda" };
    const attached = {
      id: "c1", tenantId: "legacy-tenant", patientId: "p1", notes: null, planId: null,
      prescription: null, _count: { evolutionEntries: 0 },
    };

    function expectNoWrites() {
      expect(mocks.prisma.appointment.update).not.toHaveBeenCalled();
      expect(mocks.prisma.patient.updateMany).not.toHaveBeenCalled();
      expect(mocks.prisma.consultation.create).not.toHaveBeenCalled();
      expect(mocks.prisma.consultation.deleteMany).not.toHaveBeenCalled();
      expect(mocks.enqueueMessage).not.toHaveBeenCalled();
    }

    it("sin agenda original verificada → rechaza antes de leer el turno", async () => {
      mocks.prisma.agenda.findUnique.mockResolvedValue(null);
      mocks.prisma.appointment.findUniqueOrThrow.mockResolvedValue(prevAppt(STARTS));
      await expect(setAppointmentStatus({ id: "a1", status: "COMPLETED" }))
        .rejects.toThrow("No se pudo verificar la agenda de la instalación original.");
      expect(mocks.prisma.appointment.findUniqueOrThrow).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it.each([
      { tenantId: "other-tenant", agendaId: "other-agenda" },
      { tenantId: "legacy-tenant", agendaId: "other-agenda" },
      { tenantId: null, agendaId: null },
    ])("turno fuera del alcance %j → no escribe", async (ownership) => {
      const row = { ...prevAppt(STARTS), ...ownership };
      const notFound = new Error("Turno no encontrado");
      mocks.prisma.appointment.findUniqueOrThrow.mockImplementation(async ({ where }) => {
        if (!Object.entries(where).every(([key, value]) => row[key as keyof typeof row] === value)) throw notFound;
        return row;
      });
      await expect(setAppointmentStatus({ id: "a1", status: "COMPLETED" })).rejects.toBe(notFound);
      expectNoWrites();
    });

    it.each([
      ["COMPLETED", { tenantId: "other-tenant" }],
      ["CONFIRMED", { tenantId: null }],
      ["NO_SHOW", { patientId: "other-patient" }],
    ] as const)("a %s con consulta ajena o sin dueño %j → no escribe", async (status, mismatch) => {
      mocks.prisma.appointment.findUniqueOrThrow.mockResolvedValue({
        ...prevAppt(new Date(Date.now() + 86_400_000), "COMPLETED"), consultation: { ...attached, ...mismatch },
      });
      await expect(setAppointmentStatus({ id: "a1", status }))
        .rejects.toThrow("La consulta no pertenece a la paciente y al consultorio del turno.");
      expectNoWrites();
    });

    it("completa el turno en su agenda y crea la consulta con su tenant", async () => {
      mocks.prisma.appointment.findUniqueOrThrow.mockResolvedValue(prevAppt(STARTS, "CONFIRMED"));
      await expect(setAppointmentStatus({ id: "a1", status: "COMPLETED" })).resolves.toEqual({
        appointment: { id: "a1", status: "COMPLETED" }, consultation: { id: "c1", created: true },
        removedEmptyConsultation: false,
      });
      expect(mocks.prisma.appointment.update).toHaveBeenCalledWith({
        where: { ...scopedAppointment, patientId: "p1" }, data: { status: "COMPLETED" },
      });
      expect(mocks.prisma.consultation.create).toHaveBeenCalledWith({
        data: { tenantId: "legacy-tenant", patientId: "p1", appointmentId: "a1", consultedAt: STARTS },
      });
    });

    it.each([false, true])("al salir de COMPLETED conserva la consulta si tiene contenido (%s)", async (hasNotes) => {
      mocks.prisma.appointment.findUniqueOrThrow.mockResolvedValue({
        ...prevAppt(STARTS, "COMPLETED"), consultation: { ...attached, notes: hasNotes ? "Control" : null },
      });
      await expect(setAppointmentStatus({ id: "a1", status: "NO_SHOW" })).resolves.toEqual({
        appointment: { id: "a1", status: "NO_SHOW" }, consultation: null, removedEmptyConsultation: !hasNotes,
      });
      if (hasNotes) expect(mocks.prisma.consultation.deleteMany).not.toHaveBeenCalled();
      else expect(mocks.prisma.consultation.deleteMany).toHaveBeenCalledWith({ where: {
        id: "c1", patientId: "p1", tenantId: "legacy-tenant", appointmentId: "a1",
        notes: null, planId: null, evolutionEntries: { none: {} }, prescription: { is: null },
      } });
    });

    it("P2002 → reintenta la transacción y reutiliza la consulta del mismo dueño", async () => {
      mocks.prisma.appointment.findUniqueOrThrow
        .mockResolvedValueOnce(prevAppt(STARTS, "CONFIRMED"))
        .mockResolvedValueOnce({ ...prevAppt(STARTS, "CONFIRMED"), consultation: attached });
      const conflict = Object.assign(new Prisma.PrismaClientKnownRequestError("conflict", {
        code: "P2002", clientVersion: "test",
      }), { code: "P2002" });
      mocks.prisma.consultation.create.mockRejectedValueOnce(conflict);
      await expect(setAppointmentStatus({ id: "a1", status: "COMPLETED" })).resolves.toEqual({
        appointment: { id: "a1", status: "COMPLETED" }, consultation: { id: "c1", created: false },
        removedEmptyConsultation: false,
      });
      expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(mocks.prisma.consultation.create).toHaveBeenCalledTimes(1);
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
    mockLegacyAgenda();
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
    expect(mocks.prisma.appointment.findUnique).toHaveBeenCalledWith({
      where: { id: "a1", tenantId: "legacy-tenant", agendaId: "legacy-agenda" },
      include: { patient: true, service: true },
    });
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
      where: { patientJid: PATIENT.whatsappJid, tenantId: "legacy-tenant", step: "CONFIRM_ATTENDANCE", context: { path: ["apptId"], equals: "a1" } },
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
