import { messages } from "@nutri-bot/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAppointment: vi.fn(), checkout: vi.fn(), professional: vi.fn(), patient: vi.fn(), error: vi.fn(),
  available: vi.fn(), notifyMissing: vi.fn(), scopedPatient: vi.fn(), token: vi.fn(), cancelable: vi.fn(),
  MercadoPagoUnavailableError: class MercadoPagoUnavailableError extends Error {},
  prisma: { agenda: { findUnique: vi.fn(), findFirst: vi.fn() }, service: { findUniqueOrThrow: vi.fn() }, conversationState: { findUnique: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() }, patient: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() }, outboundMessage: { create: vi.fn() } },
}));
vi.mock("@nutri-bot/db", () => ({ prisma: mocks.prisma }));
vi.mock("../../../packages/db/index", () => ({ prisma: mocks.prisma }));
vi.mock("@nutri-bot/db/domain", () => ({
  createAppointment: mocks.createAppointment, createDepositCheckout: mocks.checkout,
  getProfessional: mocks.professional, findOrCreatePatientByJid: mocks.patient,
  findPatientByJidOrThrow: mocks.scopedPatient, createPatientToken: mocks.token,
  SlotUnavailableError: class extends Error {},
  // HU-023
  isMercadoPagoCheckoutAvailable: mocks.available,
  notifyMercadoPagoMissingForBooking: mocks.notifyMissing,
  MercadoPagoUnavailableError: mocks.MercadoPagoUnavailableError,
}));
vi.mock("./booking", () => ({ cancelableAppointments: mocks.cancelable }));
vi.mock("./ai/ask", () => ({}));
vi.mock("./ai/runtime", () => ({ getBotAiRuntime: () => null }));
vi.mock("./logger", () => ({ logger: { error: mocks.error } }));
import { handleIncoming } from "./conversation";

const state = mocks.prisma.conversationState;
const tenantId = "legacy-tenant";
const owner = { tenantId };

describe("WhatsApp booking confirmation without Baileys", () => {
  const startsAt = new Date("2026-10-05T15:00:00Z");
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.agenda.findUnique.mockResolvedValue({ professional: { phoneJid: "bound-alert" } });
    mocks.prisma.agenda.findFirst.mockResolvedValue({ id: "legacy-agenda", tenantId: "legacy-tenant", professionalId: 1, professional: { phoneJid: "bound-alert" } });
    mocks.professional.mockResolvedValue({ timezone: "America/Argentina/Buenos_Aires", currency: "ARS", botPaused: false, botAiEnabled: false });
    mocks.patient.mockResolvedValue({ id: "patient", name: "Test" });
    mocks.prisma.service.findUniqueOrThrow.mockResolvedValue({ name: "Consulta nutricional" });
    state.findUnique.mockResolvedValue({ step: "BOOK_CONFIRM", context: { serviceId: "service", startsAt: startsAt.toISOString() }, updatedAt: new Date() });
    state.createMany.mockResolvedValue({ count: 0 });
    state.updateMany.mockResolvedValue({ count: 1 });
  });

  it("preserves first contact without a preexisting Patient and keeps the raw session JID", async () => {
    const raw = "5493510000000:2@lid";
    state.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ step: "DORMANT", context: {}, tenantId, updatedAt: new Date() });
    state.createMany.mockResolvedValueOnce({ count: 1 });
    mocks.patient.mockResolvedValue({ id: "new", name: null });
    const send = vi.fn();
    await handleIncoming(raw, "turno", send);
    expect(state.findUnique.mock.calls).toEqual(["5493510000000@lid", raw, raw].map((patientJid) => [{ where: { tenantId_patientJid: { tenantId, patientJid } } }]));
    expect(mocks.patient.mock.calls).toEqual([[owner, raw]]);
    expect(state.createMany.mock.calls).toEqual(["DORMANT", "ASK_NAME"].map((step) => [{
      data: { patientJid: raw, tenantId, step, context: {} }, skipDuplicates: true,
    }]));
    expect(state.updateMany.mock.calls).toEqual([[{ where: { patientJid: raw, ...owner }, data: { step: "ASK_NAME", context: {} } }]]);
    expect(send.mock.calls).toEqual([[messages.ASK_NAME]]);
  });

  it.each(["2", "4", "0"])("menu option %s rejects patient lookup failure before side effects", async (choice) => {
    state.findUnique.mockResolvedValue({ step: "MENU", updatedAt: new Date() });
    const notFound = new Error("Patient not found");
    mocks.scopedPatient.mockRejectedValue(notFound);
    mocks.prisma.patient.findUniqueOrThrow.mockResolvedValue({ id: "foreign" });
    mocks.cancelable.mockResolvedValue([]);
    const send = vi.fn();
    await expect(handleIncoming("fake-patient", choice, send, { alertJid: "fake-alert", afterHours: { enabled: false, start: "00:00", end: "00:00" } })).rejects.toBe(notFound);
    expect(mocks.scopedPatient.mock.calls).toEqual([[owner, "fake-patient"]]);
    expect(mocks.prisma.patient.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.cancelable).not.toHaveBeenCalled();
    expect(mocks.prisma.outboundMessage.create).not.toHaveBeenCalled();
    expect(state.createMany).not.toHaveBeenCalled();
    expect(state.updateMany).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("preserves the portal link for an owned JID", async () => {
    state.findUnique.mockResolvedValue({ step: "MENU", updatedAt: new Date() });
    mocks.scopedPatient.mockResolvedValue({ id: "own" });
    mocks.token.mockReturnValue("test-token");
    const send = vi.fn();
    await handleIncoming("fake-patient", "4", send);
    expect(mocks.token).toHaveBeenCalledWith("own", 15);
    expect(send.mock.calls).toEqual([[messages.portalLink(`${process.env.AUTH_URL}/portal/login?token=test-token`)]]);
  });

  it("preserves the empty cancellation list for an owned JID", async () => {
    state.findUnique.mockResolvedValue({ step: "MENU", updatedAt: new Date() });
    mocks.scopedPatient.mockResolvedValue({ id: "own" });
    mocks.cancelable.mockResolvedValue([]);
    const send = vi.fn();
    await handleIncoming("fake-patient", "2", send);
    expect(mocks.cancelable.mock.calls).toEqual([["own"]]);
    expect(send.mock.calls).toEqual([[messages.NO_APPTS_TO_CANCEL], [messages.menu({ withQuestions: false })]]);
  });

  it("queues daytime handoff for the bound professional and tenant", async () => {
    state.findUnique.mockResolvedValue({ step: "MENU", updatedAt: new Date() });
    mocks.scopedPatient.mockResolvedValue({ name: "Ana", phone: "123" });
    const send = vi.fn();
    await handleIncoming("fake-patient", "0", send, { afterHours: { enabled: false, start: "00:00", end: "00:00" } });
    expect(send.mock.calls).toEqual([[messages.HANDOFF]]);
    expect(mocks.prisma.outboundMessage.create.mock.calls).toEqual([[{ data: {
      tenantId: "legacy-tenant", toJid: "bound-alert", kind: "PROFESSIONAL_ALERT",
      body: messages.professionalHandoffAlert({ patientName: "Ana", patientPhone: "123" }),
    } }]]);
    expect(state.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { step: "AWAIT_INQUIRY", context: { alerted: true, confirmed: false } } }));
  });

  it("rejects a JID collision before loading state, checking payments or creating an appointment", async () => {
    const collision = new Error("Global JID already exists");
    mocks.patient.mockRejectedValue(collision);
    const send = vi.fn();
    await expect(handleIncoming("fake-patient", "sí", send)).rejects.toBe(collision);
    expect(state.createMany).not.toHaveBeenCalled();
    expect(state.updateMany).not.toHaveBeenCalled();
    expect(mocks.available).not.toHaveBeenCalled();
    expect(mocks.createAppointment).not.toHaveBeenCalled();
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends normal confirmation and never creates checkout without a deposit", async () => {
    mocks.createAppointment.mockResolvedValue({ id: "appointment", status: "CONFIRMED", startsAt });
    const send = vi.fn();
    await handleIncoming("fake-patient", "sí", send);
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(expect.stringContaining("Turno confirmado"));
  });

  it("sends service, date, amount, URL and deadline for a deposit reservation", async () => {
    mocks.prisma.service.findUniqueOrThrow.mockResolvedValue({ name: "Consulta nutricional", requiresDeposit: true });
    mocks.available.mockResolvedValue(true);
    mocks.createAppointment.mockResolvedValue({ id: "appointment", status: "AWAITING_PAYMENT", startsAt });
    mocks.checkout.mockResolvedValue({ amount: 3000, checkoutUrl: "https://checkout.example.test/deposit" });
    const send = vi.fn();
    await handleIncoming("fake-patient", "sí", send);
    expect(mocks.createAppointment).toHaveBeenCalledWith({ tenantId: "legacy-tenant" }, { patientId: "patient", serviceId: "service", startsAt, createdBy: "PATIENT", notifyPatient: false, reason: null, professionalAlertJid: undefined });
    expect(mocks.checkout).toHaveBeenCalledWith(owner, "appointment");
    const message = send.mock.calls[0]?.[0];
    for (const text of ["Consulta nutricional", "lunes 5 de octubre", "12:00", "3.000", "https://checkout.example.test/deposit", "15 minutos"]) expect(message).toContain(text);
    expect(message).not.toContain("Turno confirmado");
  });

  it("reports checkout failure without logging provider credentials", async () => {
    mocks.createAppointment.mockResolvedValue({ id: "appointment", status: "AWAITING_PAYMENT", startsAt });
    mocks.checkout.mockRejectedValue(new Error("Authorization: Bearer sensitive-test-token"));
    const send = vi.fn();
    await handleIncoming("fake-patient", "sí", send);
    expect(send).toHaveBeenCalledWith(expect.stringContaining("Hubo un problema"));
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain("sensitive-test-token");
    expect(state.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { step: "MENU", context: {} } }));
  });

  // HU-023 (D3/D5): sin cuenta de Mercado Pago usable no se crea el turno con seña.
  describe("seña sin Mercado Pago (HU-023)", () => {
    beforeEach(() => {
      mocks.prisma.service.findUniqueOrThrow.mockResolvedValue({ name: "Consulta nutricional", requiresDeposit: true });
      mocks.prisma.patient.findUnique.mockResolvedValue({ name: "Ana", phone: "+5493515552345" });
      mocks.notifyMissing.mockResolvedValue(true);
    });

    it("no disponible → no crea el turno, avisa al paciente y a la profesional", async () => {
      mocks.available.mockResolvedValue(false);
      const send = vi.fn();
      await handleIncoming("fake-patient", "sí", send);
      expect(mocks.createAppointment).not.toHaveBeenCalled();
      expect(mocks.checkout).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(messages.DEPOSIT_UNAVAILABLE);
      expect(mocks.prisma.patient.findUnique).toHaveBeenCalledWith({ where: { id: "patient", tenantId: "legacy-tenant" }, select: { name: true, phone: true } });
      expect(mocks.notifyMissing).toHaveBeenCalledWith(owner, { patientName: "Ana", patientPhone: "+5493515552345", serviceName: "Consulta nutricional" });
      expect(state.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { step: "MENU", context: {} } }));
    });

    it("disponible → flujo de seña de siempre", async () => {
      mocks.available.mockResolvedValue(true);
      mocks.createAppointment.mockResolvedValue({ id: "appointment", status: "AWAITING_PAYMENT", startsAt });
      mocks.checkout.mockResolvedValue({ amount: 3000, checkoutUrl: "https://checkout.example.test/deposit" });
      const send = vi.fn();
      await handleIncoming("fake-patient", "sí", send);
      expect(mocks.checkout).toHaveBeenCalledWith(owner, "appointment");
      expect(send.mock.calls[0]?.[0]).toContain("https://checkout.example.test/deposit");
      expect(mocks.notifyMissing).not.toHaveBeenCalled();
    });

    it("el checkout tira MercadoPagoUnavailableError (carrera) → mismo mensaje y aviso", async () => {
      mocks.available.mockResolvedValue(true);
      mocks.createAppointment.mockResolvedValue({ id: "appointment", status: "AWAITING_PAYMENT", startsAt });
      mocks.checkout.mockRejectedValue(new mocks.MercadoPagoUnavailableError("No hay cuenta de Mercado Pago usable"));
      const send = vi.fn();
      await handleIncoming("fake-patient", "sí", send);
      expect(send).toHaveBeenCalledWith(messages.DEPOSIT_UNAVAILABLE);
      expect(send).not.toHaveBeenCalledWith(expect.stringContaining("Hubo un problema"));
      expect(mocks.notifyMissing).toHaveBeenCalledWith(owner, { patientName: "Ana", patientPhone: "+5493515552345", serviceName: "Consulta nutricional" });
    });

    it("un error al encolar el aviso no cambia lo que ve el paciente", async () => {
      mocks.available.mockResolvedValue(false);
      mocks.notifyMissing.mockRejectedValue(new Error("db down"));
      const send = vi.fn();
      await handleIncoming("fake-patient", "sí", send);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(messages.DEPOSIT_UNAVAILABLE);
      expect(mocks.error).toHaveBeenCalledWith({ errorType: "Error" }, "Error avisando que falta Mercado Pago");
    });

    it("servicio sin seña → no consulta la disponibilidad de Mercado Pago", async () => {
      mocks.prisma.service.findUniqueOrThrow.mockResolvedValue({ name: "Consulta nutricional", requiresDeposit: false });
      mocks.createAppointment.mockResolvedValue({ id: "appointment", status: "CONFIRMED", startsAt });
      const send = vi.fn();
      await handleIncoming("fake-patient", "sí", send);
      expect(mocks.available).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledWith(expect.stringContaining("Turno confirmado"));
    });
  });
});
