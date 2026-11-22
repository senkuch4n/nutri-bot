// HU-014: recordatorios por servicio (prisma mockeado, sin base ni red).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@nutri-bot/core";

const mocks = vi.hoisted(() => ({
  enqueueMessage: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    agenda: { findFirst: vi.fn() },
    appointment: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    conversationState: { createMany: vi.fn(), updateMany: vi.fn() },
    outboundMessage: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("../index", () => ({
  prisma: mocks.prisma,
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
vi.mock("./outbox", () => ({ enqueueMessage: mocks.enqueueMessage }));

import { enqueuePrepInstructions, enqueueReminderNow, enqueueServiceReminders, getAppointmentReminderStatus } from "./reminders";

const T = { tenantId: "legacy-tenant" };

const TZ = "America/Argentina/Buenos_Aires";
const H = 3_600_000;
const STARTS = new Date("2026-10-15T13:00:00Z"); // jueves 10:00
const NOW_24H = new Date(STARTS.getTime() - 24 * H + 60_000); // miércoles 10:01
const NOW_72H = new Date(STARTS.getTime() - 72 * H + 60_000); // lunes 10:01
const JID = "5490000014099@s.whatsapp.net";

const tenantId = "legacy-tenant";
const agendaId = "legacy-agenda";
const appointmentScope = { tenantId, agendaId, patient: { tenantId }, service: { tenantId } };

function appt(over: Record<string, unknown> = {}) {
  return {
    id: "a1",
    tenantId, agendaId, patientId: "p1", serviceId: "s1", updatedAt: new Date("2026-10-01T12:00:00Z"),
    startsAt: STARTS,
    status: "CONFIRMED",
    createdAt: new Date("2026-10-01T12:00:00Z"),
    bookedAt: new Date("2026-10-01T12:00:00Z"),
    confirmationRequestedAt: null,
    patient: { tenantId, name: "Ana", whatsappJid: JID },
    service: {
      tenantId,
      name: "Control",
      active: true,
      reminders: [
        { amount: 3, unit: "DAYS", asksConfirmation: true },
        { amount: 24, unit: "HOURS", asksConfirmation: false },
      ],
    },
    messages: [] as { kind: string; dedupeKey: string; createdAt?: Date }[],
    ...over,
    ...(over.service && typeof over.service === "object" ? { service: { tenantId, ...over.service } } : {}),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.appointment.findMany.mockResolvedValue([]);
  mocks.prisma.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) =>
    [{ id: sql.join("").includes('FROM "Professional"') ? 1 : "a1" }]);
  mocks.prisma.agenda.findFirst.mockResolvedValue({ id: "legacy-agenda", tenantId: "legacy-tenant", professionalId: 1, professional: { timezone: TZ } });
  mocks.prisma.appointment.findUnique.mockResolvedValue({ id: "a1" });
  mocks.prisma.appointment.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.conversationState.createMany.mockResolvedValue({ count: 1 });
  mocks.enqueueMessage.mockResolvedValue(true);
  mocks.prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
});

describe("verified legacy reminder scope", () => {
  it("fails closed for all entry points without the original agenda", async () => {
    mocks.prisma.agenda.findFirst.mockResolvedValue(null);
    for (const run of [() => enqueuePrepInstructions(T), () => enqueueServiceReminders(T), () => enqueueReminderNow(T, "a1"), () => getAppointmentReminderStatus(T, "a1")]) {
      await expect(run()).rejects.toThrow("tenant_scope:tenant_scope_missing");
    }
    expect(mocks.prisma.appointment.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.appointment.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
    expect(mocks.prisma.outboundMessage.create).not.toHaveBeenCalled();
    expect(mocks.prisma.conversationState.createMany).not.toHaveBeenCalled();
  });

  it.each([
    { tenantId: "other" }, { agendaId: "other" }, { tenantId: null, agendaId: null },
    { patient: { tenantId: "other", whatsappJid: JID } },
    { service: { tenantId: "other", reminders: [{ amount: 3, unit: "DAYS", asksConfirmation: true }] } },
  ])("does not act on an unowned or inconsistent scan row (%j)", async (over) => {
    mocks.prisma.appointment.findMany.mockResolvedValue([appt(over)]);
    await expect(enqueueServiceReminders(T, { now: NOW_72H })).resolves.toEqual({ reminders: 0, confirmations: 0 });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
    expect(mocks.prisma.appointment.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.conversationState.createMany).not.toHaveBeenCalled();
  });

  it.each(["lost claim", "insert error", "owned state missing after conflict"])("rolls back a confirmation on %s", async (failure) => {
    const stateFailure = failure !== "lost claim";
    mocks.prisma.appointment.findMany.mockResolvedValue([appt()]);
    const committed = { queue: [] as unknown[], confirmationRequestedAt: null as Date | null };
    const staged = { ...committed, queue: [] as unknown[] };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
      agenda: mocks.prisma.agenda,
      appointment: { findUnique: vi.fn().mockResolvedValue({ id: "a1" }), updateMany: vi.fn(async ({ data }) => {
        if (!stateFailure) return { count: 0 };
        staged.confirmationRequestedAt = data.confirmationRequestedAt;
        return { count: 1 };
      }) },
      conversationState: {
        createMany: failure === "insert error"
          ? vi.fn().mockRejectedValue(new Error("state write failed"))
          : vi.fn().mockResolvedValue({ count: 0 }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    mocks.enqueueMessage.mockImplementation(async (message, client) => {
      (client === tx ? staged : committed).queue.push(message);
      return true;
    });
    mocks.prisma.$transaction.mockImplementation(async (fn) => {
      const result = await fn(tx);
      Object.assign(committed, staged);
      return result;
    });
    const run = enqueueServiceReminders(T, { now: NOW_72H });
    if (failure === "owned state missing after conflict") {
      await expect(run).rejects.toThrow("No se pudo guardar el estado de conversación en la instalación original.");
      expect(tx.conversationState.updateMany.mock.calls).toEqual([[{
        where: { patientJid: JID, tenantId },
        data: { step: "CONFIRM_ATTENDANCE", context: { apptId: "a1" } },
      }]]);
    } else {
      if (stateFailure) await expect(run).rejects.toThrow("state write failed");
      else await expect(run).resolves.toEqual({ reminders: 0, confirmations: 0 });
      expect(tx.conversationState.updateMany).not.toHaveBeenCalled();
    }
    expect(committed).toEqual({ queue: [], confirmationRequestedAt: null });
    expect(tx.conversationState.createMany).toHaveBeenCalledTimes(stateFailure ? 1 : 0);
  });

  it("rechecks the original schedule after acquiring the same professional lock as rescheduling", async () => {
    const scanned = appt();
    mocks.prisma.appointment.findMany.mockResolvedValue([scanned]);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
      agenda: mocks.prisma.agenda,
      appointment: { findUnique: vi.fn().mockResolvedValue(null), updateMany: mocks.prisma.appointment.updateMany },
      conversationState: mocks.prisma.conversationState,
    };
    mocks.prisma.$transaction.mockImplementation(async (fn) => fn(tx));
    await expect(enqueueServiceReminders(T, { now: NOW_72H })).resolves.toEqual({ reminders: 0, confirmations: 0 });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const [sql, owner] = tx.$queryRaw.mock.calls[0]!;
    expect(sql.join("?")).toMatch(/FROM "Professional" p[\s\S]*WHERE a\."tenantId" = \? AND a\."isPrimary" = true[\s\S]*FOR UPDATE OF p/);
    expect(owner).toBe(tenantId);
    expect(tx.appointment.findUnique).toHaveBeenCalledWith({
      where: { ...appointmentScope, id: scanned.id, status: scanned.status, startsAt: scanned.startsAt,
        updatedAt: scanned.updatedAt, patientId: scanned.patientId, serviceId: scanned.serviceId,
        patient: { tenantId, whatsappJid: JID }, confirmationRequestedAt: null },
      select: { id: true },
    });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]!).toBeLessThan(tx.appointment.findUnique.mock.invocationCallOrder[0]!);
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
    expect(tx.appointment.updateMany).not.toHaveBeenCalled();
    expect(tx.conversationState.createMany).not.toHaveBeenCalled();
  });

  it("does not enqueue when the verified professional row cannot be locked", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([appt()]);
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    await expect(enqueueServiceReminders(T, { now: NOW_72H })).resolves.toEqual({ reminders: 0, confirmations: 0 });
    expect(mocks.prisma.appointment.findUnique).not.toHaveBeenCalled();
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
    expect(mocks.prisma.appointment.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.conversationState.createMany).not.toHaveBeenCalled();
  });

  it("does not expose or notify an appointment with an out-of-scope relationship", async () => {
    mocks.prisma.appointment.findUnique.mockResolvedValue(appt({ patient: { tenantId: "other", whatsappJid: JID } }));
    await expect(getAppointmentReminderStatus(T, "a1")).resolves.toEqual([]);
    await expect(enqueueReminderNow(T, "a1", { now: NOW_72H })).rejects.toThrow("Turno inexistente: a1");
    expect(mocks.prisma.outboundMessage.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.outboundMessage.create).not.toHaveBeenCalled();
  });
});

describe("enqueuePrepInstructions", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("preserves the prep window and dedupe, narrowing the verified scope to fixture patients", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_24H);
    const service = { name: "Control", prepInstructions: "Ayuno", prepLeadHours: 24 };
    mocks.prisma.appointment.findMany.mockResolvedValue([
      appt({ service }),
      appt({ id: "foreign", service: { ...service, tenantId: "other" } }),
      appt({ id: "later", service, startsAt: new Date(NOW_24H.getTime() + 24 * H + 20 * 60_000) }),
    ]);
    expect(await enqueuePrepInstructions(T, 20, { patientIds: ["p1", "foreign"] })).toBe(1);
    expect(mocks.prisma.appointment.findMany.mock.calls[0]![0].where).toEqual({
      ...appointmentScope, status: "CONFIRMED", startsAt: { gte: NOW_24H },
      service: { tenantId, prepInstructions: { not: null }, prepLeadHours: { not: null } },
      messages: { none: { kind: "PREP_INSTRUCTIONS", OR: [{ tenantId }, { tenantId: null }] } },
      patientId: { in: ["p1", "foreign"] },
    });
    expect(mocks.enqueueMessage.mock.calls).toEqual([[{
      toJid: JID, kind: "PREP_INSTRUCTIONS", appointmentId: "a1",
      body: messages.prepInstructionsMessage({ serviceName: "Control", startsAt: STARTS, tz: TZ, instructions: "Ayuno" }),
    }]]);
    mocks.enqueueMessage.mockResolvedValue(false);
    expect(await enqueuePrepInstructions(T, 20, { patientIds: ["p1"] })).toBe(0);
  });
});

describe("enqueueServiceReminders", () => {
  it("consulta turnos CONFIRMED futuros hasta 15 días, sin filtrar por servicio activo, con scope", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([]);
    await enqueueServiceReminders(T, { now: NOW_24H, scope: { patientIds: ["p1"] } });
    const { where } = mocks.prisma.appointment.findMany.mock.calls[0]![0];
    expect(where).toEqual({
      ...appointmentScope,
      status: "CONFIRMED",
      startsAt: { gt: NOW_24H, lte: new Date(NOW_24H.getTime() + 15 * 24 * H) },
      patientId: { in: ["p1"] },
    });
    expect(JSON.stringify(where)).not.toContain("active");
    expect(mocks.prisma.agenda.findFirst).toHaveBeenCalledWith({
      where: { tenantId, isPrimary: true },
      select: { id: true, tenantId: true, professionalId: true, professional: { select: { timezone: true, phoneJid: true } } },
    });

    mocks.prisma.appointment.findMany.mockClear();
    await enqueueServiceReminders(T, { now: NOW_24H });
    expect(mocks.prisma.appointment.findMany.mock.calls[0]![0].where.patientId).toBeUndefined();
  });

  it("encola el REMINDER de 24 h con su clave y la frase", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([
      appt({ service: { name: "Control", reminders: [{ amount: 24, unit: "HOURS", asksConfirmation: false }] } }),
    ]);
    const res = await enqueueServiceReminders(T, { now: NOW_24H });
    expect(res).toEqual({ reminders: 1, confirmations: 0 });
    const call = mocks.enqueueMessage.mock.calls[0]![0];
    expect(call).toMatchObject({ toJid: JID, kind: "REMINDER", appointmentId: "a1", dedupeKey: "auto:24h" });
    expect(call.body).toContain("tenés turno mañana");
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(mocks.prisma.conversationState.createMany).not.toHaveBeenCalled();
  });

  it("el que pide confirmar manda CONFIRMATION_REQUEST, marca el turno y la conversación", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([appt()]);
    const res = await enqueueServiceReminders(T, { now: NOW_72H });
    expect(res).toEqual({ reminders: 0, confirmations: 1 });
    const call = mocks.enqueueMessage.mock.calls[0]![0];
    expect(call.kind).toBe("CONFIRMATION_REQUEST");
    expect(mocks.prisma.appointment.findUnique.mock.invocationCallOrder[0]!)
      .toBeLessThan(mocks.enqueueMessage.mock.invocationCallOrder[0]!);
    expect(mocks.enqueueMessage.mock.calls[0]![1]).toBe(mocks.prisma);
    expect(call.dedupeKey).toBeUndefined();
    expect(call.body).toBe(messages.confirmAttendanceRequest({ serviceName: "Control", startsAt: STARTS, tz: TZ }));
    expect(mocks.prisma.appointment.updateMany).toHaveBeenCalledWith({
      where: { ...appointmentScope, id: "a1", status: "CONFIRMED", startsAt: STARTS,
        patientId: "p1", serviceId: "s1", patient: { tenantId, whatsappJid: JID },
        updatedAt: appt().updatedAt, confirmationRequestedAt: null },
      data: { confirmationRequestedAt: NOW_72H },
    });
    expect(mocks.prisma.conversationState.createMany).toHaveBeenCalledWith({
      data: { patientJid: JID, tenantId, step: "CONFIRM_ATTENDANCE", context: { apptId: "a1" } },
      skipDuplicates: true,
    });
    expect(mocks.prisma.conversationState.updateMany).not.toHaveBeenCalled();
  });

  it("si enqueueMessage no creó la fila, no toca turno ni conversación y no cuenta", async () => {
    mocks.enqueueMessage.mockResolvedValue(false);
    mocks.prisma.appointment.findMany.mockResolvedValue([appt()]);
    const res = await enqueueServiceReminders(T, { now: NOW_72H });
    expect(res).toEqual({ reminders: 0, confirmations: 0 });
    expect(mocks.prisma.appointment.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.conversationState.createMany).not.toHaveBeenCalled();

    mocks.prisma.appointment.findMany.mockResolvedValue([appt()]);
    expect(await enqueueServiceReminders(T, { now: NOW_24H })).toEqual({ reminders: 0, confirmations: 0 });
  });

  it("pide createdAt de los mensajes", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([]);
    await enqueueServiceReminders(T, { now: NOW_24H });
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
    expect(await enqueueServiceReminders(T, { now: new Date(STARTS.getTime() - 20 * H) })).toEqual({ reminders: 0, confirmations: 0 });
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
    await enqueueServiceReminders(T, { now: new Date(STARTS.getTime() - 60 * H) });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });

  it("un manual posterior al momento no cubre al automático", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([
      appt({
        service: { name: "Control", reminders: [{ amount: 24, unit: "HOURS", asksConfirmation: false }] },
        messages: [{ kind: "REMINDER", dedupeKey: "manual:x", createdAt: NOW_24H }],
      }),
    ]);
    expect(await enqueueServiceReminders(T, { now: NOW_24H })).toEqual({ reminders: 1, confirmations: 0 });
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
    expect(await enqueueServiceReminders(T, { now: NOW_24H })).toEqual({ reminders: 0, confirmations: 0 });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });

  it("confirmationRequestedAt sin fila cuenta como confirmación enviada", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([appt({ confirmationRequestedAt: new Date("2026-10-12T13:00:00Z") })]);
    await enqueueServiceReminders(T, { now: NOW_72H });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });

  it("bookedAt null usa createdAt (reserva tardía → no encola)", async () => {
    const late = new Date(STARTS.getTime() - 20 * H);
    mocks.prisma.appointment.findMany.mockResolvedValue([appt({ bookedAt: null, createdAt: late })]);
    await enqueueServiceReminders(T, { now: new Date(STARTS.getTime() - 19 * H) });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });

  it("reminders basura en el servicio → no tira ni encola", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([appt({ service: { name: "X", reminders: { foo: 1 } } })]);
    await expect(enqueueServiceReminders(T, { now: NOW_24H })).resolves.toEqual({ reminders: 0, confirmations: 0 });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });

  it("un turno que falla no impide encolar el siguiente", async () => {
    const only24 = { name: "Control", reminders: [{ amount: 24, unit: "HOURS", asksConfirmation: false }] };
    mocks.prisma.appointment.findMany.mockResolvedValue([
      appt({ id: "a1", service: only24 }),
      appt({ id: "a2", service: only24 }),
    ]);
    mocks.enqueueMessage.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(true);
    await expect(enqueueServiceReminders(T, { now: NOW_24H })).resolves.toEqual({ reminders: 1, confirmations: 0 });
    expect(mocks.enqueueMessage.mock.calls[1]![0].appointmentId).toBe("a2");
  });

  it("si fallan todos los que tenían algo para encolar, tira", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([appt()]);
    mocks.enqueueMessage.mockRejectedValue(new Error("boom"));
    await expect(enqueueServiceReminders(T, { now: NOW_24H })).rejects.toThrow("boom");
  });
});

describe("enqueueReminderNow", () => {
  const NOW = new Date("2026-10-13T15:00:00Z");

  it.each([
    ["cancelado", { status: "CANCELLED" }],
    ["pasado", { startsAt: new Date("2026-10-13T14:00:00Z") }],
  ])("turno %s → not_applicable sin crear", async (_label, over) => {
    mocks.prisma.appointment.findUnique.mockResolvedValue(appt(over));
    await expect(enqueueReminderNow(T, "a1", { now: NOW })).resolves.toBe("not_applicable");
    expect(mocks.prisma.outboundMessage.create).not.toHaveBeenCalled();
  });

  it("manual pendiente → already_pending sin crear", async () => {
    mocks.prisma.appointment.findUnique.mockResolvedValue(appt());
    mocks.prisma.outboundMessage.findFirst.mockResolvedValue({ id: "m1" });
    await expect(enqueueReminderNow(T, "a1", { now: NOW })).resolves.toBe("already_pending");
    expect(mocks.prisma.outboundMessage.findFirst.mock.calls[0]![0].where).toEqual({
      appointmentId: "a1",
      OR: [{ tenantId }, { tenantId: null }],
      kind: "REMINDER",
      status: "PENDING",
      dedupeKey: { startsWith: "manual:" },
    });
    expect(mocks.prisma.outboundMessage.create).not.toHaveBeenCalled();
  });

  it("si no, crea un REMINDER manual con la frase → queued, dentro de la transacción y con FOR UPDATE antes", async () => {
    mocks.prisma.appointment.findUnique.mockResolvedValue(appt());
    mocks.prisma.outboundMessage.findFirst.mockResolvedValue(null);
    await expect(enqueueReminderNow(T, "a1", { now: NOW })).resolves.toBe("queued");
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    const { data } = mocks.prisma.outboundMessage.create.mock.calls[0]![0];
    expect(data).toMatchObject({ toJid: JID, kind: "REMINDER", appointmentId: "a1", tenantId, dedupeKey: `manual:${NOW.toISOString()}` });
    expect(data.body).toContain("tenés turno pasado mañana");
    const rawOrder = mocks.prisma.$queryRaw.mock.invocationCallOrder[0]!;
    expect(rawOrder).toBeLessThan(mocks.prisma.outboundMessage.findFirst.mock.invocationCallOrder[0]!);
    const [sql, ...values] = mocks.prisma.$queryRaw.mock.calls[0]!;
    expect(sql.join("?")).toMatch(/WHERE id = \? AND "tenantId" = \? AND "agendaId" = \?\s+FOR UPDATE/);
    expect(values).toEqual(["a1", tenantId, agendaId]);
  });

  it("turno inexistente → tira", async () => {
    mocks.prisma.appointment.findUnique.mockResolvedValue(null);
    await expect(enqueueReminderNow(T, "nope", { now: NOW })).rejects.toThrow();
  });
});

describe("getAppointmentReminderStatus", () => {
  it("turno inexistente → []", async () => {
    mocks.prisma.appointment.findUnique.mockResolvedValue(null);
    await expect(getAppointmentReminderStatus(T, "nope")).resolves.toEqual([]);
  });

  it("arma los ítems con la config vigente y los mensajes", async () => {
    mocks.prisma.appointment.findUnique.mockResolvedValue(
      appt({ messages: [{ kind: "CONFIRMATION_REQUEST", dedupeKey: "", status: "SENT", createdAt: new Date("2026-10-12T13:01:00Z") }] }),
    );
    const items = await getAppointmentReminderStatus(T, "a1", { now: new Date("2026-10-13T13:00:00Z") });
    expect(items).toEqual([
      { label: "3 días antes, pide confirmar", state: "sent" },
      { label: "24 h antes", state: "pending" },
    ]);
  });
});

// HU-022 (S6): al reprogramar, los mensajes ya enviados del horario viejo quedan con dedupeKey
// "prev:…" y dejan de contar; los recordatorios y la confirmación vuelven a salir para el nuevo.
describe("enqueueServiceReminders con mensajes del horario viejo (prev:)", () => {
  const OLD = "2026-10-20T13:00:00.000Z";

  it("un CONFIRMATION_REQUEST prev: no cuenta como confirmación enviada", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([
      appt({
        messages: [{ kind: "CONFIRMATION_REQUEST", dedupeKey: `prev:${OLD}:m1:`, createdAt: new Date(NOW_72H.getTime() - 2 * H) }],
      }),
    ]);
    const res = await enqueueServiceReminders(T, { now: NOW_72H });
    expect(res).toEqual({ reminders: 0, confirmations: 1 });
    expect(mocks.enqueueMessage.mock.calls[0]![0].kind).toBe("CONFIRMATION_REQUEST");
  });

  it("un mensaje prev: posterior al momento no cubre al recordatorio nuevo", async () => {
    const only24 = { name: "Control", reminders: [{ amount: 24, unit: "HOURS", asksConfirmation: false }] };
    mocks.prisma.appointment.findMany.mockResolvedValue([
      appt({
        service: only24,
        messages: [
          { kind: "CONFIRMATION_REQUEST", dedupeKey: `prev:${OLD}:m1:`, createdAt: new Date(NOW_24H.getTime() - 30_000) },
          { kind: "REMINDER", dedupeKey: `prev:${OLD}:m2:auto:24h`, createdAt: new Date(NOW_24H.getTime() - 20_000) },
        ],
      }),
    ]);
    const res = await enqueueServiceReminders(T, { now: NOW_24H });
    expect(res).toEqual({ reminders: 1, confirmations: 0 });
    expect(mocks.enqueueMessage.mock.calls[0]![0]).toMatchObject({ kind: "REMINDER", dedupeKey: "auto:24h" });
  });

  it("regresión sin prev:: un CONFIRMATION_REQUEST del horario actual sigue frenando la confirmación", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([
      appt({ messages: [{ kind: "CONFIRMATION_REQUEST", dedupeKey: "", createdAt: new Date(NOW_72H.getTime() - 2 * H) }] }),
    ]);
    await expect(enqueueServiceReminders(T, { now: NOW_72H })).resolves.toEqual({ reminders: 0, confirmations: 0 });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });
});

describe("getAppointmentReminderStatus con mensajes del horario viejo (prev:)", () => {
  it("los prev: no se muestran como enviados del horario nuevo", async () => {
    mocks.prisma.appointment.findUnique.mockResolvedValue(
      appt({
        messages: [
          { kind: "CONFIRMATION_REQUEST", dedupeKey: "prev:2026-10-20T13:00:00.000Z:m1:", status: "SENT", createdAt: new Date("2026-10-12T13:01:00Z") },
        ],
      }),
    );
    const items = await getAppointmentReminderStatus(T, "a1", { now: new Date("2026-10-13T13:00:00Z") });
    expect(items[0]).toEqual({ label: "3 días antes, pide confirmar", state: "pending" });
  });
});
