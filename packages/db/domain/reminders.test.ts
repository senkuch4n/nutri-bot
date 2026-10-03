// HU-014: recordatorios por servicio (prisma mockeado, sin base ni red).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@nutri-bot/core";

const mocks = vi.hoisted(() => ({
  getProfessional: vi.fn(),
  enqueueMessage: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    appointment: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    conversationState: { upsert: vi.fn() },
    outboundMessage: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("../index", () => ({
  prisma: mocks.prisma,
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
vi.mock("./availability", () => ({ getProfessional: mocks.getProfessional }));
vi.mock("./outbox", () => ({ enqueueMessage: mocks.enqueueMessage }));

import { enqueueReminderNow, enqueueServiceReminders, getAppointmentReminderStatus } from "./reminders";

const TZ = "America/Argentina/Buenos_Aires";
const H = 3_600_000;
const STARTS = new Date("2026-10-15T13:00:00Z"); // jueves 10:00
const NOW_24H = new Date(STARTS.getTime() - 24 * H + 60_000); // miércoles 10:01
const NOW_72H = new Date(STARTS.getTime() - 72 * H + 60_000); // lunes 10:01
const JID = "5490000014099@s.whatsapp.net";

function appt(over: Record<string, unknown> = {}) {
  return {
    id: "a1",
    startsAt: STARTS,
    status: "CONFIRMED",
    createdAt: new Date("2026-10-01T12:00:00Z"),
    bookedAt: new Date("2026-10-01T12:00:00Z"),
    confirmationRequestedAt: null,
    patient: { name: "Ana", whatsappJid: JID },
    service: {
      name: "Control",
      active: true,
      reminders: [
        { amount: 3, unit: "DAYS", asksConfirmation: true },
        { amount: 24, unit: "HOURS", asksConfirmation: false },
      ],
    },
    messages: [] as { kind: string; dedupeKey: string; createdAt?: Date }[],
    ...over,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getProfessional.mockResolvedValue({ timezone: TZ });
  mocks.enqueueMessage.mockResolvedValue(true);
  mocks.prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
});

describe("enqueueServiceReminders", () => {
  it("consulta turnos CONFIRMED futuros hasta 15 días, sin filtrar por servicio activo, con scope", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([]);
    await enqueueServiceReminders({ now: NOW_24H, scope: { patientIds: ["p1"] } });
    const { where } = mocks.prisma.appointment.findMany.mock.calls[0]![0];
    expect(where).toEqual({
      status: "CONFIRMED",
      startsAt: { gt: NOW_24H, lte: new Date(NOW_24H.getTime() + 15 * 24 * H) },
      patientId: { in: ["p1"] },
    });
    expect(JSON.stringify(where)).not.toContain("active");

    mocks.prisma.appointment.findMany.mockClear();
    await enqueueServiceReminders({ now: NOW_24H });
    expect(mocks.prisma.appointment.findMany.mock.calls[0]![0].where.patientId).toBeUndefined();
  });

  it("encola el REMINDER de 24 h con su clave y la frase", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([
      appt({ service: { name: "Control", reminders: [{ amount: 24, unit: "HOURS", asksConfirmation: false }] } }),
    ]);
    const res = await enqueueServiceReminders({ now: NOW_24H });
    expect(res).toEqual({ reminders: 1, confirmations: 0 });
    const call = mocks.enqueueMessage.mock.calls[0]![0];
    expect(call).toMatchObject({ toJid: JID, kind: "REMINDER", appointmentId: "a1", dedupeKey: "auto:24h" });
    expect(call.body).toContain("tenés turno mañana");
    expect(mocks.prisma.conversationState.upsert).not.toHaveBeenCalled();
  });

  it("el que pide confirmar manda CONFIRMATION_REQUEST, marca el turno y la conversación", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([appt()]);
    const res = await enqueueServiceReminders({ now: NOW_72H });
    expect(res).toEqual({ reminders: 0, confirmations: 1 });
    const call = mocks.enqueueMessage.mock.calls[0]![0];
    expect(call.kind).toBe("CONFIRMATION_REQUEST");
    expect(call.dedupeKey).toBeUndefined();
    expect(call.body).toBe(messages.confirmAttendanceRequest({ serviceName: "Control", startsAt: STARTS, tz: TZ }));
    expect(mocks.prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { confirmationRequestedAt: NOW_72H },
    });
    expect(mocks.prisma.conversationState.upsert).toHaveBeenCalledWith({
      where: { patientJid: JID },
      create: { patientJid: JID, step: "CONFIRM_ATTENDANCE", context: { apptId: "a1" } },
      update: { step: "CONFIRM_ATTENDANCE", context: { apptId: "a1" } },
    });
  });

  it("si enqueueMessage no creó la fila, no toca turno ni conversación y no cuenta", async () => {
    mocks.enqueueMessage.mockResolvedValue(false);
    mocks.prisma.appointment.findMany.mockResolvedValue([appt()]);
    const res = await enqueueServiceReminders({ now: NOW_72H });
    expect(res).toEqual({ reminders: 0, confirmations: 0 });
    expect(mocks.prisma.appointment.update).not.toHaveBeenCalled();
    expect(mocks.prisma.conversationState.upsert).not.toHaveBeenCalled();

    mocks.prisma.appointment.findMany.mockResolvedValue([appt()]);
    expect(await enqueueServiceReminders({ now: NOW_24H })).toEqual({ reminders: 0, confirmations: 0 });
  });

  it("pide createdAt de los mensajes", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([]);
    await enqueueServiceReminders({ now: NOW_24H });
    expect(mocks.prisma.appointment.findMany.mock.calls[0]![0].include.messages.select).toEqual({
      kind: true,
      dedupeKey: true,
      createdAt: true,
    });
  });

  it("cambio de config con el de 24 h ya enviado (pasa a 48 h): no repite (SDD §15)", async () => {
    const sent24 = new Date(STARTS.getTime() - 24 * H);
    mocks.prisma.appointment.findMany.mockResolvedValue([
      appt({
        confirmationRequestedAt: new Date(STARTS.getTime() - 72 * H),
        service: {
          name: "Control",
          reminders: [
            { amount: 3, unit: "DAYS", asksConfirmation: true },
            { amount: 48, unit: "HOURS", asksConfirmation: false },
          ],
        },
        messages: [
          { kind: "CONFIRMATION_REQUEST", dedupeKey: "", createdAt: new Date(STARTS.getTime() - 72 * H) },
          { kind: "REMINDER", dedupeKey: "auto:24h", createdAt: sent24 },
        ],
      }),
    ]);
    expect(await enqueueServiceReminders({ now: new Date(STARTS.getTime() - 20 * H) })).toEqual({ reminders: 0, confirmations: 0 });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });

  it("mover 'pide confirmar' a 24 h con el pedido ya enviado: nada a las −60 h; confirmationRequestedAt cubre", async () => {
    const reqAt = new Date(STARTS.getTime() - 72 * H + 60_000);
    mocks.prisma.appointment.findMany.mockResolvedValue([
      appt({
        confirmationRequestedAt: reqAt,
        service: {
          name: "Control",
          reminders: [
            { amount: 3, unit: "DAYS", asksConfirmation: false },
            { amount: 24, unit: "HOURS", asksConfirmation: true },
          ],
        },
        messages: [],
      }),
    ]);
    await enqueueServiceReminders({ now: new Date(STARTS.getTime() - 60 * H) });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });

  it("un manual posterior al momento no cubre al automático", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([
      appt({
        service: { name: "Control", reminders: [{ amount: 24, unit: "HOURS", asksConfirmation: false }] },
        messages: [{ kind: "REMINDER", dedupeKey: "manual:x", createdAt: NOW_24H }],
      }),
    ]);
    expect(await enqueueServiceReminders({ now: NOW_24H })).toEqual({ reminders: 1, confirmations: 0 });
  });

  it("no repite: auto:24h ya encolado", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([
      appt({
        messages: [
          { kind: "CONFIRMATION_REQUEST", dedupeKey: "", createdAt: new Date("2026-10-12T13:01:00Z") },
          { kind: "REMINDER", dedupeKey: "auto:24h", createdAt: NOW_24H },
        ],
      }),
    ]);
    expect(await enqueueServiceReminders({ now: NOW_24H })).toEqual({ reminders: 0, confirmations: 0 });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });

  it("confirmationRequestedAt sin fila cuenta como confirmación enviada", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([appt({ confirmationRequestedAt: new Date("2026-10-12T13:00:00Z") })]);
    await enqueueServiceReminders({ now: NOW_72H });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });

  it("bookedAt null usa createdAt (reserva tardía → no encola)", async () => {
    const late = new Date(STARTS.getTime() - 20 * H);
    mocks.prisma.appointment.findMany.mockResolvedValue([appt({ bookedAt: null, createdAt: late })]);
    await enqueueServiceReminders({ now: new Date(STARTS.getTime() - 19 * H) });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });

  it("reminders basura en el servicio → no tira ni encola", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([appt({ service: { name: "X", reminders: { foo: 1 } } })]);
    await expect(enqueueServiceReminders({ now: NOW_24H })).resolves.toEqual({ reminders: 0, confirmations: 0 });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });

  it("un turno que falla no impide encolar el siguiente", async () => {
    const only24 = { name: "Control", reminders: [{ amount: 24, unit: "HOURS", asksConfirmation: false }] };
    mocks.prisma.appointment.findMany.mockResolvedValue([
      appt({ id: "a1", service: only24 }),
      appt({ id: "a2", service: only24 }),
    ]);
    mocks.enqueueMessage.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(true);
    await expect(enqueueServiceReminders({ now: NOW_24H })).resolves.toEqual({ reminders: 1, confirmations: 0 });
    expect(mocks.enqueueMessage.mock.calls[1]![0].appointmentId).toBe("a2");
  });

  it("si fallan todos los que tenían algo para encolar, tira", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([appt()]);
    mocks.enqueueMessage.mockRejectedValue(new Error("boom"));
    await expect(enqueueServiceReminders({ now: NOW_24H })).rejects.toThrow("boom");
  });
});

describe("enqueueReminderNow", () => {
  const NOW = new Date("2026-10-13T15:00:00Z");

  it.each([
    ["cancelado", { status: "CANCELLED" }],
    ["pasado", { startsAt: new Date("2026-10-13T14:00:00Z") }],
  ])("turno %s → not_applicable sin crear", async (_label, over) => {
    mocks.prisma.appointment.findUnique.mockResolvedValue(appt(over));
    await expect(enqueueReminderNow("a1", { now: NOW })).resolves.toBe("not_applicable");
    expect(mocks.prisma.outboundMessage.create).not.toHaveBeenCalled();
  });

  it("manual pendiente → already_pending sin crear", async () => {
    mocks.prisma.appointment.findUnique.mockResolvedValue(appt());
    mocks.prisma.outboundMessage.findFirst.mockResolvedValue({ id: "m1" });
    await expect(enqueueReminderNow("a1", { now: NOW })).resolves.toBe("already_pending");
    expect(mocks.prisma.outboundMessage.findFirst.mock.calls[0]![0].where).toEqual({
      appointmentId: "a1",
      kind: "REMINDER",
      status: "PENDING",
      dedupeKey: { startsWith: "manual:" },
    });
    expect(mocks.prisma.outboundMessage.create).not.toHaveBeenCalled();
  });

  it("si no, crea un REMINDER manual con la frase → queued, dentro de la transacción y con FOR UPDATE antes", async () => {
    mocks.prisma.appointment.findUnique.mockResolvedValue(appt());
    mocks.prisma.outboundMessage.findFirst.mockResolvedValue(null);
    await expect(enqueueReminderNow("a1", { now: NOW })).resolves.toBe("queued");
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    const { data } = mocks.prisma.outboundMessage.create.mock.calls[0]![0];
    expect(data).toMatchObject({ toJid: JID, kind: "REMINDER", appointmentId: "a1", dedupeKey: `manual:${NOW.toISOString()}` });
    expect(data.body).toContain("tenés turno pasado mañana");
    const rawOrder = mocks.prisma.$queryRaw.mock.invocationCallOrder[0]!;
    expect(rawOrder).toBeLessThan(mocks.prisma.outboundMessage.findFirst.mock.invocationCallOrder[0]!);
    expect(mocks.prisma.$queryRaw.mock.calls[0]![0].join("?")).toContain("FOR UPDATE");
  });

  it("turno inexistente → tira", async () => {
    mocks.prisma.appointment.findUnique.mockResolvedValue(null);
    await expect(enqueueReminderNow("nope", { now: NOW })).rejects.toThrow();
  });
});

describe("getAppointmentReminderStatus", () => {
  it("turno inexistente → []", async () => {
    mocks.prisma.appointment.findUnique.mockResolvedValue(null);
    await expect(getAppointmentReminderStatus("nope")).resolves.toEqual([]);
  });

  it("arma los ítems con la config vigente y los mensajes", async () => {
    mocks.prisma.appointment.findUnique.mockResolvedValue(
      appt({ messages: [{ kind: "CONFIRMATION_REQUEST", dedupeKey: "", status: "SENT", createdAt: new Date("2026-10-12T13:01:00Z") }] }),
    );
    const items = await getAppointmentReminderStatus("a1", { now: new Date("2026-10-13T13:00:00Z") });
    expect(items).toEqual([
      { label: "3 días antes, pide confirmar", state: "sent" },
      { label: "24 h antes", state: "pending" },
    ]);
  });
});
