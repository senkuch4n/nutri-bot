// HU-017b-1 (SDD 4.6, 9-1): "Nuevo turno" no pisa el nombre de una paciente existente ni la duplica.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AGENDA_TEXT, PHONE_INPUT_TEXT } from "@nutri-bot/core";

const mocks = vi.hoisted(() => {
  class SlotUnavailableError extends Error {}
  class InvalidBookingReasonError extends Error {}
  return {
    revalidatePath: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    createAppointment: vi.fn(),
    setAppointmentStatus: vi.fn(),
    cancelAppointment: vi.fn(),
    updateAppointmentReason: vi.fn(),
    findOrCreatePatient: vi.fn(),
    getProfessional: vi.fn(async () => ({ timezone: "America/Argentina/Buenos_Aires" })),
    SlotUnavailableError,
    InvalidBookingReasonError,
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db", () => ({
  prisma: {
    patient: { findUnique: mocks.findUnique, findMany: mocks.findMany, update: mocks.update, upsert: mocks.upsert },
    appointment: { groupBy: mocks.groupBy },
  },
}));
vi.mock("@nutri-bot/db/domain", () => ({
  enqueueReminderNow: vi.fn(),
  getAppointmentReminderStatus: vi.fn(),
  getProfessional: mocks.getProfessional,
}));
vi.mock("@/lib/appointments", () => ({
  cancelAppointment: mocks.cancelAppointment,
  createAppointment: mocks.createAppointment,
  setAppointmentStatus: mocks.setAppointmentStatus,
  updateAppointmentReason: mocks.updateAppointmentReason,
  SlotUnavailableError: mocks.SlotUnavailableError,
  InvalidBookingReasonError: mocks.InvalidBookingReasonError,
}));
vi.mock("@/lib/patients", () => ({
  findOrCreatePatient: mocks.findOrCreatePatient,
  phoneToJid: (phone: string) => `${phone.replace(/\D/g, "")}@s.whatsapp.net`,
}));

import {
  cancelAppointmentAction,
  createAppointmentAction,
  listAppointmentPatientsAction,
  saveAppointmentReasonAction,
  setStatusAction,
} from "./actions";

const T = AGENDA_TEXT.create;
const STARTS = "2026-10-08T13:00:00.000Z";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.groupBy.mockResolvedValue([]);
  mocks.createAppointment.mockResolvedValue({ id: "appt-1" });
  mocks.findOrCreatePatient.mockResolvedValue({ id: "pat-new" });
});

describe("createAppointmentAction, paciente existente", () => {
  it("usa el patientId y no toca la paciente", async () => {
    mocks.findUnique.mockResolvedValue({ id: "pat-1", whatsappJid: "5493515552345@s.whatsapp.net" });
    const res = await createAppointmentAction(
      { ok: false },
      form({ patientId: "pat-1", serviceId: "svc-1", startsAt: STARTS, reason: "" }),
    );
    expect(res).toEqual({ ok: true });
    expect(mocks.createAppointment).toHaveBeenCalledWith({
      patientId: "pat-1",
      serviceId: "svc-1",
      startsAt: new Date(STARTS),
      createdBy: "PROFESSIONAL",
      reason: null,
    });
    expect(mocks.findOrCreatePatient).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pacientes"); // HU-019: crear el turno desarchiva
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/turnos"); // HU-021
  });

  it("paciente inexistente o un canal → patientGone, sin crear el turno", async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    expect(await createAppointmentAction({ ok: false }, form({ patientId: "x", serviceId: "svc-1", startsAt: STARTS }))).toEqual({
      ok: false,
      error: T.patientGone,
    });
    mocks.findUnique.mockResolvedValueOnce({ id: "ch", whatsappJid: "120363@newsletter" });
    expect(await createAppointmentAction({ ok: false }, form({ patientId: "ch", serviceId: "svc-1", startsAt: STARTS }))).toEqual({
      ok: false,
      error: T.patientGone,
    });
    expect(mocks.createAppointment).not.toHaveBeenCalled();
  });
});

describe("createAppointmentAction, paciente nueva", () => {
  it("normaliza el teléfono escrito a mano y crea la paciente", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const res = await createAppointmentAction(
      { ok: false },
      form({ patientName: " Lucía Pérez ", patientPhone: "351 555 2345", serviceId: "svc-1", startsAt: STARTS }),
    );
    expect(res).toEqual({ ok: true });
    expect(mocks.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { whatsappJid: "5493515552345@s.whatsapp.net" } }),
    );
    expect(mocks.findOrCreatePatient).toHaveBeenCalledWith({ phone: "5493515552345", name: "Lucía Pérez" });
    expect(mocks.createAppointment).toHaveBeenCalledWith(expect.objectContaining({ patientId: "pat-new" }));
  });

  it("número que ya es de otra paciente → existingPatient, sin escribir nada", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "pat-9",
      name: "María José Gómez",
      phone: "5493515552345",
      whatsappJid: "5493515552345@s.whatsapp.net",
      archivedAt: null,
    });
    const res = await createAppointmentAction(
      { ok: false },
      form({ patientName: "Lucía Pérez", patientPhone: "0351 15 555 2345", serviceId: "svc-1", startsAt: STARTS }),
    );
    expect(res).toEqual({
      ok: false,
      error: "Ese número es de María José Gómez",
      existingPatient: { id: "pat-9", name: "María José Gómez", label: "María José Gómez", archived: false },
    });
    expect(mocks.findOrCreatePatient).not.toHaveBeenCalled();
    expect(mocks.createAppointment).not.toHaveBeenCalled();
  });

  it("HU-019: número de una archivada → aviso de archivada y existingPatient.archived, sin crear turno", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "pat-7",
      name: "Ana López",
      phone: "5491155551234",
      whatsappJid: "5491155551234@s.whatsapp.net",
      archivedAt: new Date("2026-10-01T12:00:00Z"),
    });
    const res = await createAppointmentAction(
      { ok: false },
      form({ patientName: "Ana", patientPhone: "11 5555-1234", serviceId: "svc-1", startsAt: STARTS }),
    );
    expect(res).toEqual({
      ok: false,
      error: "Ese número es de Ana López, que está archivada.",
      existingPatient: { id: "pat-7", name: "Ana López", label: "Ana López", archived: true },
    });
    expect(mocks.findOrCreatePatient).not.toHaveBeenCalled();
    expect(mocks.createAppointment).not.toHaveBeenCalled();
  });

  it("validaciones: teléfono, nombre y servicio", async () => {
    expect(
      await createAppointmentAction(
        { ok: false },
        form({ patientName: "Lucía", patientPhone: "555 2345", serviceId: "svc-1", startsAt: STARTS }),
      ),
    ).toEqual({ ok: false, error: PHONE_INPUT_TEXT.invalid });
    expect(
      await createAppointmentAction(
        { ok: false },
        form({ patientName: "Lucía", patientPhone: "", serviceId: "svc-1", startsAt: STARTS }),
      ),
    ).toEqual({ ok: false, error: PHONE_INPUT_TEXT.empty });
    expect(
      await createAppointmentAction(
        { ok: false },
        form({ patientName: " ", patientPhone: "351 555 2345", serviceId: "svc-1", startsAt: STARTS }),
      ),
    ).toEqual({ ok: false, error: T.nameRequired });
    expect(
      await createAppointmentAction({ ok: false }, form({ patientId: "pat-1", startsAt: STARTS })),
    ).toEqual({ ok: false, error: T.serviceRequired });
    expect(mocks.findOrCreatePatient).not.toHaveBeenCalled();
    expect(mocks.createAppointment).not.toHaveBeenCalled();
  });
});

describe("createAppointmentAction, errores del dominio", () => {
  beforeEach(() => {
    mocks.findUnique.mockResolvedValue({ id: "pat-1", whatsappJid: "5493515552345@s.whatsapp.net" });
  });
  const send = () =>
    createAppointmentAction({ ok: false }, form({ patientId: "pat-1", serviceId: "svc-1", startsAt: STARTS }));

  it("horario ocupado → slotGone", async () => {
    mocks.createAppointment.mockRejectedValue(new mocks.SlotUnavailableError("x"));
    expect(await send()).toEqual({ ok: false, error: T.slotGone });
  });
  it("motivo inválido → su mensaje", async () => {
    mocks.createAppointment.mockRejectedValue(new mocks.InvalidBookingReasonError("Motivo muy largo"));
    expect(await send()).toEqual({ ok: false, error: "Motivo muy largo" });
  });
  it("otro error → genericError, sin revalidar", async () => {
    mocks.createAppointment.mockRejectedValue(new Error("db"));
    expect(await send()).toEqual({ ok: false, error: T.genericError });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("listAppointmentPatientsAction", () => {
  it("descarta canales, pone los con nombre primero y devuelve solo los campos del tipo", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    mocks.findMany.mockResolvedValue([
      { id: "u1", name: null, phone: "5493510000001", whatsappJid: "5493510000001@s.whatsapp.net", createdAt, appointments: [] },
      { id: "n1", name: "Zoe Ruiz", phone: "5493510000002", whatsappJid: "5493510000002@s.whatsapp.net", createdAt, appointments: [] },
      { id: "c1", name: null, phone: "120363", whatsappJid: "120363@newsletter", createdAt, appointments: [] },
      { id: "n2", name: "Ana Díaz", phone: "93127792677049", whatsappJid: "93127792677049@lid", createdAt, appointments: [] },
    ]);
    const rows = await listAppointmentPatientsAction();
    expect(rows.map((r) => r.id)).toEqual(["n2", "n1", "u1"]);
    expect(Object.keys(rows[0]!).sort()).toEqual(
      ["contactKind", "id", "name", "phoneDigits", "phoneLabel", "recentAt", "searchName", "statusLine"].sort(),
    );
    expect(rows[0]).toMatchObject({ name: "Ana Díaz", contactKind: "hidden", phoneLabel: null, statusLine: "Sin turno" });
    expect(rows[1]).toMatchObject({ phoneLabel: "+54 9 351 000-0002", phoneDigits: "5493510000002" });
  });

  it("recentAt: el último turno ya pasado (no cancelado) o el alta, el que sea más nuevo", async () => {
    const old = new Date("2026-01-01T00:00:00Z");
    const fresh = new Date("2026-10-28T00:00:00Z");
    mocks.findMany.mockResolvedValue([
      { id: "seen", name: "Ana Díaz", phone: "5493510000001", whatsappJid: "5493510000001@s.whatsapp.net", createdAt: old, appointments: [] },
      { id: "new", name: "Bea Gil", phone: "5493510000002", whatsappJid: "5493510000002@s.whatsapp.net", createdAt: fresh, appointments: [] },
      { id: "none", name: "Cami Paz", phone: "5493510000003", whatsappJid: "5493510000003@s.whatsapp.net", createdAt: old, appointments: [] },
    ]);
    mocks.groupBy.mockResolvedValue([
      { patientId: "seen", _max: { startsAt: new Date("2026-10-20T13:00:00Z") } },
      { patientId: "new", _max: { startsAt: new Date("2026-03-01T13:00:00Z") } },
    ]);
    const rows = await listAppointmentPatientsAction();
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.recentAt]));
    expect(byId).toEqual({
      seen: "2026-10-20T13:00:00.000Z",
      new: "2026-10-28T00:00:00.000Z",
      none: "2026-01-01T00:00:00.000Z",
    });
    const args = mocks.groupBy.mock.calls[0]![0];
    expect(args.by).toEqual(["patientId"]);
    expect(args.where.status).toEqual({ not: "CANCELLED" });
    expect(args.where.startsAt.lt).toBeInstanceOf(Date);
  });

  it("HU-019: pide solo activas y, si igual llega una archivada, core la descarta", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    mocks.findMany.mockResolvedValue([
      { id: "a1", name: "Ana López", phone: "5493510000003", whatsappJid: "5493510000003@s.whatsapp.net", createdAt, archivedAt: new Date(), appointments: [] },
      { id: "n1", name: "Zoe Ruiz", phone: "5493510000002", whatsappJid: "5493510000002@s.whatsapp.net", createdAt, archivedAt: null, appointments: [] },
    ]);
    const rows = await listAppointmentPatientsAction();
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { archivedAt: null } }));
    expect(mocks.findMany.mock.calls[0]![0].select.archivedAt).toBe(true);
    expect(rows.map((r) => r.id)).toEqual(["n1"]);
  });
});

describe("HU-021: las actions del turno revalidan /turnos", () => {
  it("setStatusAction ok → revalida el calendario y la lista de turnos", async () => {
    mocks.setAppointmentStatus.mockResolvedValue({
      appointment: { patientId: "pat-1" },
      consultation: null,
      removedEmptyConsultation: false,
    });
    expect(await setStatusAction("appt-1", "COMPLETED")).toEqual({ ok: true, consultation: null });
    expect(mocks.setAppointmentStatus).toHaveBeenCalledWith({ id: "appt-1", status: "COMPLETED" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/turnos");
  });

  it("setStatusAction con error del dominio → mensaje y sin revalidar", async () => {
    mocks.setAppointmentStatus.mockRejectedValue(new Error("db down"));
    expect(await setStatusAction("appt-1", "NO_SHOW")).toEqual({ ok: false, error: "No se pudo actualizar el turno." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("cancelAppointmentAction ok → revalida el calendario y la lista de turnos", async () => {
    mocks.cancelAppointment.mockResolvedValue(undefined);
    expect(await cancelAppointmentAction("appt-1")).toEqual({ ok: true });
    expect(mocks.cancelAppointment).toHaveBeenCalledWith({ id: "appt-1", by: "PROFESSIONAL", reason: undefined });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/turnos");
  });

  it("saveAppointmentReasonAction ok → también revalida /turnos", async () => {
    mocks.updateAppointmentReason.mockResolvedValue({ patientId: "pat-1", reason: "Control" });
    expect(await saveAppointmentReasonAction("appt-1", "Control")).toEqual({ ok: true, reason: "Control" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/turnos");
  });
});
