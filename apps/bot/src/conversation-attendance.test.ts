import { messages } from "@nutri-bot/core";
import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  agenda: { findUnique: vi.fn() },
  appointment: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  patient: { findUnique: vi.fn() },
  conversationState: { findUnique: vi.fn(), createMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));
const mocks = vi.hoisted(() => ({ enqueue: vi.fn(), createPatient: vi.fn() }));
vi.mock("@nutri-bot/db", () => ({ prisma: db }));
vi.mock("../../../packages/db/index", () => ({ prisma: db }));
vi.mock("../../../packages/db/domain/outbox", () => ({ enqueueMessage: mocks.enqueue }));
vi.mock("../../../packages/db/domain/availability", () => ({}));
vi.mock("../../../packages/db/domain/reminders", () => ({}));
vi.mock("@nutri-bot/db/domain", async () => ({
  ...await import("../../../packages/db/domain/appointments"),
  getProfessional: async () => ({ botPaused: false, botAiEnabled: false, timezone: "UTC" }),
  findOrCreatePatientByJid: mocks.createPatient,
}));
vi.mock("./booking", () => ({}));
vi.mock("./ai/ask", () => ({}));
vi.mock("./ai/runtime", () => ({ getBotAiRuntime: () => null }));
vi.mock("./logger", () => ({}));
import { handleIncoming, handleIncomingMedia } from "./conversation";

const jid = "5493510000000@s.whatsapp.net";
const now = new Date("2026-11-20T12:00:00Z");
const startsAt = new Date("2026-11-21T12:00:00Z");
const tenantId = "legacy-tenant";
const owner = { tenantId };
const appointment = {
  id: "a", tenantId, agendaId: "legacy-agenda", patientId: "p", serviceId: "s",
  status: "CONFIRMED", startsAt, confirmationRequestedAt: new Date("2026-11-19T12:00:00Z"),
  confirmationRespondedAt: null, confirmationResponse: null,
  service: { tenantId, name: "Consulta" }, patient: { tenantId, whatsappJid: jid, name: "Ana", phone: "123" },
};
const state = { step: "CONFIRM_ATTENDANCE", context: { apptId: "a" }, updatedAt: new Date("2026-11-19T12:00:00Z") };

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((fn) => fn(db));
  db.agenda.findUnique.mockResolvedValue({ professional: { timezone: "America/Argentina/Buenos_Aires", phoneJid: "alert" } });
  db.patient.findUnique.mockResolvedValue({ id: "p" });
  db.conversationState.findUnique.mockResolvedValue(state);
  db.conversationState.createMany.mockResolvedValue({ count: 0 });
  db.conversationState.updateMany.mockResolvedValue({ count: 1 });
  db.appointment.findUnique.mockResolvedValue(appointment);
  db.appointment.findFirst.mockResolvedValue(appointment);
  db.appointment.updateMany.mockResolvedValue({ count: 1 });
});

it.each(["sí", "no"])("rejects an appointment not matching the verified sender and scope: %s", async (text) => {
  db.appointment.findFirst.mockResolvedValue(null);
  const send = vi.fn();
  await handleIncoming(jid, text, send, { now });
  expect(db.appointment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
    id: "a", tenantId, agendaId: "legacy-agenda", patientId: "p",
    patient: { tenantId, whatsappJid: jid }, service: { tenantId },
    status: "CONFIRMED", startsAt: { gt: now }, confirmationRequestedAt: { not: null }, confirmationRespondedAt: null,
  }) }));
  expectNoWrites(send);
});

it.each([
  { status: "CONFIRMED", startsAt: now, text: "sí" },
  { status: "CANCELLED", startsAt, text: "no" },
])("silently clears only the verified stale prompt ($status)", async ({ status, startsAt, text }) => {
  db.appointment.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...appointment, status, startsAt });
  const send = vi.fn();
  await handleIncoming(jid, text, send, { now });
  expect(db.conversationState.deleteMany.mock.calls).toEqual([[{ where: {
    patientJid: jid, ...owner, step: "CONFIRM_ATTENDANCE", context: { equals: { apptId: "a" } }, updatedAt: state.updatedAt,
  } }]]);
  expect(db.appointment.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: {
    id: "a", tenantId, agendaId: "legacy-agenda", patientId: "p",
    patient: { tenantId, whatsappJid: jid }, service: { tenantId },
    OR: [{ status: "CANCELLED" }, { startsAt: { lte: now } }],
  } }));
  expectNoWrites(send, false, 1);
});

it.each(["unknown sender", "missing agenda", "lost update"])("fails closed for %s", async (reason) => {
  if (reason === "unknown sender") db.patient.findUnique.mockResolvedValue(null);
  if (reason === "missing agenda") db.agenda.findUnique.mockResolvedValue(null);
  if (reason === "lost update") db.appointment.updateMany.mockResolvedValue({ count: 0 });
  const send = vi.fn();
  if (reason === "missing agenda") {
    await expect(handleIncoming(jid, "no", send, { now })).rejects.toThrow("No se pudo verificar la agenda de la instalación original.");
    expect(db.conversationState.findUnique).not.toHaveBeenCalled();
  } else await handleIncoming(jid, "no", send, { now });
  expectNoWrites(send, reason === "lost update");
});

function expectNoWrites(send: ReturnType<typeof vi.fn>, attempted = false, promptDeletes = 0) {
  expect(db.appointment.update).not.toHaveBeenCalled();
  expect(db.appointment.updateMany).toHaveBeenCalledTimes(attempted ? 1 : 0);
  expect(mocks.createPatient).not.toHaveBeenCalled();
  expect(db.conversationState.createMany).not.toHaveBeenCalled();
  expect(db.conversationState.updateMany).not.toHaveBeenCalled();
  expect(db.conversationState.deleteMany).toHaveBeenCalledTimes(promptDeletes);
  expect(mocks.enqueue).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
}

it.each([true, false])("preserves the legacy attendance reply (%s) using an atomic scoped write", async (attending) => {
  const send = vi.fn();
  await handleIncoming("5493510000000:2@s.whatsapp.net", attending ? "sí" : "no", send, { now });
  expect(db.conversationState.findUnique).toHaveBeenCalledWith({ where: { tenantId_patientJid: { tenantId, patientJid: jid } } });
  expect(db.patient.findUnique).toHaveBeenCalledWith({ where: { tenantId_whatsappJid: { tenantId, whatsappJid: jid } }, select: { id: true } });
  expect(db.appointment.updateMany).toHaveBeenCalledWith({
    where: { ...db.appointment.findFirst.mock.calls[0]?.[0].where, serviceId: "s", confirmationRequestedAt: appointment.confirmationRequestedAt },
    data: { confirmationResponse: attending, confirmationRespondedAt: expect.any(Date), ...(!attending && {
      status: "CANCELLED", cancelledBy: "PATIENT", cancelReason: "Avisó que no puede asistir", needsGoogleSync: true,
    }) },
  });
  expect(db.appointment.update).not.toHaveBeenCalled();
  const message = attending ? messages.attendanceConfirmedThanks : messages.attendanceDeclinedNotice;
  expect(send.mock.calls).toEqual([[message({ serviceName: "Consulta", startsAt, tz: "America/Argentina/Buenos_Aires" })]]);
  expect(mocks.enqueue.mock.calls).toEqual(attending ? [] : [[{
    toJid: "alert", kind: "PROFESSIONAL_ALERT", verifiedTenantId: tenantId,
    body: messages.professionalCancelAlert({ patientName: "Ana", patientPhone: "123", serviceName: "Consulta", startsAt, tz: "America/Argentina/Buenos_Aires" }),
  }]]);
  expect(db.conversationState.deleteMany.mock.calls).toEqual(attending ? [] : [[{ where: {
    patientJid: jid, ...owner, step: { in: ["CANCEL_CONFIRM", "CONFIRM_ATTENDANCE"] },
    context: { path: ["apptId"], equals: "a" },
  } }]]);
  expect(db.conversationState.createMany.mock.calls).toEqual([[{
    data: { patientJid: jid, tenantId, step: "MENU", context: {} }, skipDuplicates: true,
  }]]);
  expect(db.conversationState.updateMany.mock.calls).toEqual([[{
    where: { patientJid: jid, ...owner }, data: { step: "MENU", context: {} },
  }]]);
});

it("does not read state or reply to media without the original scope", async () => {
  db.agenda.findUnique.mockResolvedValue(null);
  const send = vi.fn();
  await expect(handleIncomingMedia(jid, send, { now })).rejects.toThrow("No se pudo verificar la agenda de la instalación original.");
  expect(db.conversationState.findUnique).not.toHaveBeenCalled();
  expectNoWrites(send);
});

it("preserves media silence after expiry and refreshes active context using the raw JID", async () => {
  const rawJid = "5493510000000:2@s.whatsapp.net";
  const context = { inquiryId: "i", alerted: true };
  db.conversationState.findUnique.mockResolvedValueOnce({ step: "AWAIT_INQUIRY", context, updatedAt: state.updatedAt })
    .mockResolvedValueOnce({ step: "AWAIT_INQUIRY", context, updatedAt: now });
  const send = vi.fn();
  await handleIncomingMedia(rawJid, send, { now });
  expectNoWrites(send);
  await handleIncomingMedia(rawJid, send, { now });
  expect(send.mock.calls).toEqual([[messages.INQUIRY_TEXT_ONLY]]);
  expect(db.conversationState.findUnique.mock.calls).toEqual(Array.from({ length: 2 }, () => [{ where: { tenantId_patientJid: { tenantId, patientJid: rawJid } } }]));
  expect(db.conversationState.createMany.mock.calls).toEqual([[{
    data: { patientJid: rawJid, tenantId, step: "AWAIT_INQUIRY", context }, skipDuplicates: true,
  }]]);
  expect(db.conversationState.updateMany.mock.calls).toEqual([[{
    where: { patientJid: rawJid, ...owner }, data: { step: "AWAIT_INQUIRY", context },
  }]]);
  expect(mocks.createPatient).not.toHaveBeenCalled();
});

it("prompts for a clear answer only while the verified request is in an active conversation", async () => {
  const send = vi.fn();
  await handleIncoming(jid, "tal vez", send, { now });
  expect(db.appointment.findFirst).not.toHaveBeenCalled();
  expectNoWrites(send);

  db.conversationState.findUnique.mockResolvedValue({ ...state, updatedAt: now });
  await handleIncoming(jid, "tal vez", send, { now });
  expect(send.mock.calls).toEqual([["Respondé *sí* si vas a poder venir, o *no* si no vas a poder."]]);
  send.mockClear();
  expectNoWrites(send);
});
