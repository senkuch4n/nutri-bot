import { beforeEach, describe, expect, it, vi } from "vitest";
import { PAYMENT_METHODS, messages } from "@nutri-bot/core";

const mocks = vi.hoisted(() => ({
  getProfessional: vi.fn(),
  getAvailableSlotsForService: vi.fn(),
  prisma: {
    botAiQuestion: { count: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    service: { findMany: vi.fn() },
    appointment: { findMany: vi.fn() },
    conversationState: { updateMany: vi.fn() },
  },
}));
vi.mock("../index", () => ({ prisma: mocks.prisma }));
vi.mock("./availability", () => ({
  getProfessional: mocks.getProfessional,
  getAvailableSlotsForService: mocks.getAvailableSlotsForService,
}));

import {
  BOT_AI_COUNTED_OUTCOMES,
  clearExpiredAiSessions,
  countBotAiQuestionsToday,
  markBotAiQuestionHandedOff,
  purgeExpiredBotAiQuestions,
  recordBotAiQuestion,
  runBotAiTool,
} from "./botAi";

const TZ = "America/Argentina/Buenos_Aires";
const NOW = new Date("2026-10-03T02:10:00Z"); // 23:10 del 2/10 en BA
const PRO = {
  id: 1,
  name: "Daiana Ponce",
  title: "Lic.",
  timezone: TZ,
  currency: "ARS",
  acceptedInsurances: "OSDE, IOMA",
  afterHoursEnabled: true,
  afterHoursStart: "22:00",
  afterHoursEnd: "09:00",
  botAiInfo: "Av. Siempre Viva 123",
};
const dec = (n: number) => ({ toString: () => String(n) });
const SERVICE = {
  id: "svc-1",
  name: "Antropometría",
  description: null,
  price: dec(25000),
  requiresDeposit: false,
  depositKind: null,
  depositValue: null,
  durationMin: 45,
  prepInstructions: "Ir en ayunas.",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getProfessional.mockResolvedValue(PRO);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("countBotAiQuestionsToday", () => {
  it("cuenta del paciente y global en el día de la tz, sin LIMIT_*", async () => {
    mocks.prisma.botAiQuestion.count.mockResolvedValueOnce(3).mockResolvedValueOnce(40);
    const r = await countBotAiQuestionsToday({ patientId: "p1", now: NOW, tz: TZ });
    expect(r).toEqual({ patient: 3, global: 40 });
    const [first, second] = mocks.prisma.botAiQuestion.count.mock.calls.map((c) => c[0].where);
    const askedAt = { gte: new Date("2026-10-02T03:00:00Z"), lt: new Date("2026-10-03T03:00:00Z") };
    expect(first).toEqual({ patientId: "p1", askedAt, outcome: { in: BOT_AI_COUNTED_OUTCOMES } });
    expect(second).toEqual({ askedAt, outcome: { in: BOT_AI_COUNTED_OUTCOMES } });
    expect(BOT_AI_COUNTED_OUTCOMES).not.toContain("LIMIT_PATIENT");
    expect(BOT_AI_COUNTED_OUTCOMES).not.toContain("LIMIT_GLOBAL");
  });
});

describe("recordBotAiQuestion", () => {
  it("pasa los campos, tokens ausentes en 0 y recorta la pregunta", async () => {
    mocks.prisma.botAiQuestion.create.mockResolvedValue({ id: "q1" });
    const r = await recordBotAiQuestion({
      patientId: "p1",
      askedAt: NOW,
      question: `  ${"x".repeat(2500)}  `,
      answer: "hola",
      outcome: "ANSWERED",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      inputTokens: 10,
    });
    expect(r).toEqual({ id: "q1" });
    const data = mocks.prisma.botAiQuestion.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      patientId: "p1",
      askedAt: NOW,
      answer: "hola",
      outcome: "ANSWERED",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      inputTokens: 10,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      toolRounds: 0,
      latencyMs: null,
      errorKind: null,
    });
    expect(data.question).toBe("x".repeat(2000));
  });
});

describe("markBotAiQuestionHandedOff", () => {
  it("updateMany idempotente por id + paciente + no derivada", async () => {
    mocks.prisma.botAiQuestion.updateMany.mockResolvedValue({ count: 0 });
    await markBotAiQuestionHandedOff({ id: "q1", patientId: "p1", at: NOW });
    expect(mocks.prisma.botAiQuestion.updateMany).toHaveBeenCalledWith({
      where: { id: "q1", patientId: "p1", handedOffAt: null },
      data: { handedOffAt: NOW },
    });
  });
});

describe("purgeExpiredBotAiQuestions", () => {
  it("borra lo anterior a now − días", async () => {
    mocks.prisma.botAiQuestion.deleteMany.mockResolvedValue({ count: 4 });
    const n = await purgeExpiredBotAiQuestions({ retentionDays: 90, now: new Date("2026-10-02T12:00:00Z") });
    expect(n).toBe(4);
    expect(mocks.prisma.botAiQuestion.deleteMany).toHaveBeenCalledWith({
      where: { askedAt: { lt: new Date("2026-07-04T12:00:00Z") } },
    });
  });

  it("con scope acota a esos pacientes", async () => {
    mocks.prisma.botAiQuestion.deleteMany.mockResolvedValue({ count: 1 });
    await purgeExpiredBotAiQuestions({ retentionDays: 90, now: NOW, scope: { patientIds: ["a", "b"] } });
    expect(mocks.prisma.botAiQuestion.deleteMany.mock.calls[0]![0].where.patientId).toEqual({ in: ["a", "b"] });
  });

  it("retentionDays < 1 rechaza sin borrar", async () => {
    await expect(purgeExpiredBotAiQuestions({ retentionDays: 0 })).rejects.toThrow();
    await expect(purgeExpiredBotAiQuestions({ retentionDays: Number.NaN })).rejects.toThrow();
    expect(mocks.prisma.botAiQuestion.deleteMany).not.toHaveBeenCalled();
  });
});

describe("runBotAiTool", () => {
  const base = { patientId: "p1", now: NOW };

  it("servicios: solo activos, JSON válido", async () => {
    mocks.prisma.service.findMany.mockResolvedValue([SERVICE]);
    const r = await runBotAiTool({ ...base, name: "servicios", input: {} });
    expect(r.isError).toBe(false);
    expect(mocks.prisma.service.findMany.mock.calls[0]![0].where).toEqual({ active: true });
    const parsed = JSON.parse(r.content);
    expect(parsed[0]).toMatchObject({ id: "svc-1", nombre: "Antropometría", duracionMin: 45, preparacion: "Ir en ayunas." });
    expect(parsed[0].precio).toContain("25.000");
  });

  it("mis_turnos ignora un patientId en el input", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([
      { startsAt: new Date("2026-10-08T13:00:00Z"), status: "CONFIRMED", service: { name: "Antropometría" } },
    ]);
    const r = await runBotAiTool({ ...base, name: "mis_turnos", input: { patientId: "OTRO" } });
    expect(r.isError).toBe(false);
    const args = mocks.prisma.appointment.findMany.mock.calls[0]![0];
    expect(args.where).toEqual({
      patientId: "p1",
      status: { in: ["CONFIRMED", "AWAITING_PAYMENT"] },
      startsAt: { gt: NOW },
    });
    expect(args.take).toBe(5);
    expect(JSON.parse(r.content)).toEqual([
      { servicio: "Antropometría", fechaHora: "jueves 8 de octubre, 10:00", estado: "confirmado" },
    ]);
  });

  it("disponibilidad por id: 21 días desde now", async () => {
    mocks.prisma.service.findMany.mockResolvedValue([SERVICE]);
    mocks.getAvailableSlotsForService.mockResolvedValue([new Date("2026-10-08T13:00:00Z")]);
    const r = await runBotAiTool({ ...base, name: "disponibilidad", input: { servicio: "svc-1" } });
    expect(r.isError).toBe(false);
    expect(mocks.getAvailableSlotsForService).toHaveBeenCalledWith({
      serviceId: "svc-1",
      from: NOW,
      to: new Date(NOW.getTime() + 21 * 86_400_000),
      now: NOW,
    });
    expect(JSON.parse(r.content)).toEqual({
      servicio: "Antropometría",
      dias: [{ dia: "jueves 8 de octubre", horarios: ["10:00"] }],
      sinLugar: false,
    });
  });

  it("disponibilidad por nombre sin tilde ni mayúsculas", async () => {
    mocks.prisma.service.findMany.mockResolvedValue([SERVICE]);
    mocks.getAvailableSlotsForService.mockResolvedValue([]);
    const r = await runBotAiTool({ ...base, name: "disponibilidad", input: { servicio: "ANTROPOMETRIA" } });
    expect(r.isError).toBe(false);
    expect(mocks.getAvailableSlotsForService.mock.calls[0]![0].serviceId).toBe("svc-1");
    expect(JSON.parse(r.content).sinLugar).toBe(true);
  });

  it("disponibilidad inexistente o sin servicio → error sin buscar slots", async () => {
    mocks.prisma.service.findMany.mockResolvedValue([SERVICE]);
    const r1 = await runBotAiTool({ ...base, name: "disponibilidad", input: { servicio: "Yoga" } });
    expect(r1.isError).toBe(true);
    const r2 = await runBotAiTool({ ...base, name: "disponibilidad", input: {} });
    expect(r2).toEqual({ content: "Falta el servicio.", isError: true });
    expect(mocks.getAvailableSlotsForService).not.toHaveBeenCalled();
  });

  it("datos_consultorio trae la información para el asistente", async () => {
    const r = await runBotAiTool({ ...base, name: "datos_consultorio", input: {} });
    expect(r.isError).toBe(false);
    const parsed = JSON.parse(r.content);
    expect(parsed.mediosDePago).toEqual(PAYMENT_METHODS);
    expect(parsed.mediosDePago).toEqual([
      "Tarjeta de débito",
      "Tarjeta de crédito",
      "Crédito: únicamente en 1 cuota con 10% de interés",
    ]);
    const prices = messages.pricesMessage("Consulta: $ 25.000", PRO.acceptedInsurances);
    for (const method of parsed.mediosDePago) {
      expect(prices).toContain(`• ${method}`);
    }
    expect(parsed.informacionAdicional).toBe("Av. Siempre Viva 123");
    expect(parsed.nutricionista).toBe("Lic. Daiana Ponce");
    expect(parsed.ahoraFueraDeHorario).toBe(true);
    const day = await runBotAiTool({
      ...base,
      name: "datos_consultorio",
      input: {},
      afterHours: { enabled: false, start: "22:00", end: "09:00" },
    });
    expect(JSON.parse(day.content).ahoraFueraDeHorario).toBe(false);
  });

  it("tool desconocida → error", async () => {
    expect(await runBotAiTool({ ...base, name: "borrar_turno", input: {} })).toEqual({
      content: "Herramienta desconocida.",
      isError: true,
    });
  });

  it("si la base falla no lanza", async () => {
    mocks.prisma.service.findMany.mockRejectedValue(new Error("db caída"));
    expect(await runBotAiTool({ ...base, name: "servicios", input: {} })).toEqual({
      content: "No se pudo consultar ese dato.",
      isError: true,
    });
  });
});

describe("clearExpiredAiSessions", () => {
  it("pasa a DORMANT con contexto vacío solo las sesiones del modo pregunta vencidas", async () => {
    mocks.prisma.conversationState.updateMany.mockResolvedValue({ count: 2 });
    const n = await clearExpiredAiSessions({ sessionTimeoutMs: 20 * 60_000, now: new Date("2026-10-02T12:00:00Z") });
    expect(n).toBe(2);
    expect(mocks.prisma.conversationState.updateMany).toHaveBeenCalledWith({
      where: { step: "AWAIT_QUESTION", updatedAt: { lt: new Date("2026-10-02T11:40:00Z") } },
      data: { step: "DORMANT", context: {} },
    });
  });

  it("con scope acota a esos jids", async () => {
    mocks.prisma.conversationState.updateMany.mockResolvedValue({ count: 0 });
    await clearExpiredAiSessions({ sessionTimeoutMs: 60_000, now: NOW, scope: { jids: ["x@s.whatsapp.net"] } });
    expect(mocks.prisma.conversationState.updateMany.mock.calls[0]![0].where.patientJid).toEqual({ in: ["x@s.whatsapp.net"] });
  });

  it("un timeout inválido rechaza sin tocar nada", async () => {
    await expect(clearExpiredAiSessions({ sessionTimeoutMs: 0 })).rejects.toThrow();
    await expect(clearExpiredAiSessions({ sessionTimeoutMs: Number.NaN })).rejects.toThrow();
    expect(mocks.prisma.conversationState.updateMany).not.toHaveBeenCalled();
  });
});
