import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAppointment: vi.fn(), checkout: vi.fn(), professional: vi.fn(), patient: vi.fn(), error: vi.fn(),
  prisma: { service: { findUniqueOrThrow: vi.fn() }, conversationState: { upsert: vi.fn() } },
}));
vi.mock("@nutri-bot/db", () => ({ prisma: mocks.prisma }));
vi.mock("@nutri-bot/db/domain", () => ({
  createAppointment: mocks.createAppointment, createDepositCheckout: mocks.checkout,
  getProfessional: mocks.professional, findOrCreatePatientByJid: mocks.patient,
  SlotUnavailableError: class extends Error {},
}));
vi.mock("./booking", () => ({}));
vi.mock("./ai/ask", () => ({}));
vi.mock("./ai/runtime", () => ({ getBotAiRuntime: () => null }));
vi.mock("./logger", () => ({ logger: { error: mocks.error } }));
import { handleIncoming } from "./conversation";

describe("WhatsApp booking confirmation without Baileys", () => {
  const startsAt = new Date("2026-10-05T15:00:00Z");
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.professional.mockResolvedValue({ timezone: "America/Argentina/Buenos_Aires", currency: "ARS", botPaused: false, botAiEnabled: false });
    mocks.patient.mockResolvedValue({ id: "patient", name: "Test" });
    mocks.prisma.service.findUniqueOrThrow.mockResolvedValue({ name: "Consulta nutricional" });
    mocks.prisma.conversationState.upsert.mockResolvedValue({ step: "BOOK_CONFIRM", context: { serviceId: "service", startsAt: startsAt.toISOString() }, updatedAt: new Date() });
  });

  it("sends normal confirmation and never creates checkout without a deposit", async () => {
    mocks.createAppointment.mockResolvedValue({ id: "appointment", status: "CONFIRMED", startsAt });
    const send = vi.fn();
    await handleIncoming("fake-patient", "sí", send);
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(expect.stringContaining("Turno confirmado"));
  });

  it("sends service, date, amount, URL and deadline for a deposit reservation", async () => {
    mocks.createAppointment.mockResolvedValue({ id: "appointment", status: "AWAITING_PAYMENT", startsAt });
    mocks.checkout.mockResolvedValue({ amount: 3000, checkoutUrl: "https://checkout.example.test/deposit" });
    const send = vi.fn();
    await handleIncoming("fake-patient", "sí", send);
    expect(mocks.createAppointment).toHaveBeenCalledWith({ patientId: "patient", serviceId: "service", startsAt, createdBy: "PATIENT", notifyPatient: false, reason: null, professionalAlertJid: undefined });
    expect(mocks.checkout).toHaveBeenCalledWith("appointment");
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
    expect(mocks.prisma.conversationState.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ update: { step: "MENU", context: {} } }));
  });
});
