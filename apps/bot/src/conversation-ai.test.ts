// HU-028c: el modo pregunta del bot trabaja sobre el consultorio de la conversación (topes, conteo,
// registro, derivación y tools) y la opción 5 depende de la profesional de ese consultorio. Sin WhatsApp
// ni proveedor real: `ai/ask` real con un proveedor falso; la base, mockeada.
import { messages, resolveBotAiEnv } from "@nutri-bot/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BotAiProvider } from "./ai/provider";

const mocks = vi.hoisted(() => ({
  tenantProfessional: vi.fn(),
  legacyProfessional: vi.fn(),
  patient: vi.fn(),
  settings: vi.fn(),
  count: vi.fn(),
  record: vi.fn(),
  runTool: vi.fn(),
  markHandedOff: vi.fn(),
  recordInquiry: vi.fn(),
  conversationTenant: vi.fn(),
  loadState: vi.fn(),
  saveState: vi.fn(),
  findState: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("@nutri-bot/db", () => ({ prisma: {} }));
vi.mock("@nutri-bot/db/domain", () => ({
  getTenantProfessional: mocks.tenantProfessional,
  getProfessional: mocks.legacyProfessional,
  findOrCreatePatientByJid: mocks.patient,
  getTenantAiSettings: mocks.settings,
  countBotAiQuestionsToday: mocks.count,
  recordBotAiQuestion: mocks.record,
  runBotAiTool: mocks.runTool,
  markBotAiQuestionHandedOff: mocks.markHandedOff,
  recordInquiryMessage: mocks.recordInquiry,
}));
vi.mock("@nutri-bot/db/domain/conversationState", () => ({
  findLegacyConversationState: mocks.findState,
  loadOrInitializeLegacyConversationState: mocks.loadState,
  saveLegacyConversationState: mocks.saveState,
}));
vi.mock("@nutri-bot/db/domain/tenantScope", () => ({
  resolveTenantSchedulingContext: async () => ({ professional: { phoneJid: null } }),
}));
vi.mock("./tenant", () => ({ getConversationTenant: mocks.conversationTenant }));
vi.mock("./booking", () => ({}));
vi.mock("./ai/runtime", () => ({ getBotAiRuntime: () => null, getBotAiConfig: () => resolveBotAiEnv({}) }));
vi.mock("./logger", () => ({ logger: { error: mocks.error, warn: mocks.warn } }));
import { handleIncoming } from "./conversation";

const A = { tenantId: "tenant-a" };
const TZ = "America/Argentina/Buenos_Aires";
const NOW = new Date("2026-11-27T15:00:00Z");
const JID = "5490000000001@s.whatsapp.net";
const PATIENT = { id: "patient-a", name: "Ana", phone: "5490000000001" };
const PRO_A = {
  name: "Prof A", title: null, timezone: TZ, currency: "ARS", botPaused: false, botAiEnabled: true,
  afterHoursEnabled: false, afterHoursStart: "22:00", afterHoursEnd: "09:00",
};
const QUESTION = "¿Cuánto sale la consulta?";

const answer = vi.fn<BotAiProvider["answer"]>();
const provider: BotAiProvider = { name: "fake", model: "fake-1", answer };
const opts = { now: NOW, aiProvider: provider, alertJid: null, afterHours: { enabled: false, start: "22:00", end: "09:00" } };

function inState(step: string, context: object = {}) {
  mocks.findState.mockResolvedValue(null);
  mocks.loadState.mockResolvedValue({ step, context, updatedAt: NOW });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.conversationTenant.mockResolvedValue(A);
  mocks.tenantProfessional.mockResolvedValue(PRO_A);
  mocks.legacyProfessional.mockRejectedValue(new Error("handleIncoming no tiene que leer Professional(1)"));
  mocks.patient.mockResolvedValue(PATIENT);
  mocks.settings.mockResolvedValue({ botDailyPerPatient: null, botDailyPerTenant: null });
  mocks.count.mockResolvedValue({ patient: 0, tenant: 0 });
  mocks.record.mockResolvedValue({ id: "q-1" });
  mocks.runTool.mockResolvedValue({ content: "[]", isError: false });
  mocks.recordInquiry.mockResolvedValue({ inquiry: { id: "inq-1", receivedAfterHours: false } });
  answer.mockImplementation(async (p) => {
    // La IA intenta pedir otro consultorio: el bot lo ignora.
    await p.runTool("servicios", { tenantId: "tenant-b" });
    return { kind: "answer", text: "Sale $ 25.000.", usage: { inputTokens: 10, outputTokens: 5, cacheCreationTokens: 0, cacheReadTokens: 0 }, toolRounds: 1 };
  });
});

describe("modo pregunta por consultorio (HU-028c)", () => {
  it("conteo, registro y tools reciben el consultorio de la conversación", async () => {
    inState("AWAIT_QUESTION", { aiHistory: [] });
    const send = vi.fn();
    await handleIncoming(JID, QUESTION, send, opts);
    expect(mocks.tenantProfessional).toHaveBeenCalledWith("tenant-a");
    expect(mocks.legacyProfessional).not.toHaveBeenCalled();
    expect(mocks.patient).toHaveBeenCalledWith(A, JID);
    expect(mocks.settings).toHaveBeenCalledWith(A);
    expect(mocks.count).toHaveBeenCalledWith({ tenantId: "tenant-a", patientId: "patient-a", now: NOW, tz: TZ });
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a", patientId: "patient-a", askedAt: NOW, outcome: "ANSWERED",
    }));
    expect(mocks.runTool).toHaveBeenCalledWith({
      name: "servicios", input: { tenantId: "tenant-b" }, patientId: "patient-a", tenantId: "tenant-a", now: NOW,
      afterHours: opts.afterHours,
    });
    expect(send.mock.calls).toEqual([["Sale $ 25.000."]]);
  });

  it("tope del consultorio guardado (1) con 1 pregunta hoy → AI_UNAVAILABLE, LIMIT_GLOBAL, sin proveedor", async () => {
    inState("AWAIT_QUESTION", { aiHistory: [] });
    mocks.settings.mockResolvedValue({ botDailyPerPatient: null, botDailyPerTenant: 1 });
    mocks.count.mockResolvedValue({ patient: 0, tenant: 1 });
    const send = vi.fn();
    await handleIncoming(JID, QUESTION, send, opts);
    expect(send.mock.calls).toEqual([[messages.AI_UNAVAILABLE]]);
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a", outcome: "LIMIT_GLOBAL" }));
    expect(answer).not.toHaveBeenCalled();
  });

  it("sin topes propios usa el default del .env (300): con 299 llama al proveedor", async () => {
    inState("AWAIT_QUESTION", { aiHistory: [] });
    mocks.count.mockResolvedValue({ patient: 0, tenant: 299 });
    const send = vi.fn();
    await handleIncoming(JID, QUESTION, send, opts);
    expect(answer).toHaveBeenCalledTimes(1);
    expect(send.mock.calls).toEqual([["Sale $ 25.000."]]);
  });

  it("si leer los topes del consultorio falla → AI_ERROR y el log lleva solo errName", async () => {
    inState("AWAIT_QUESTION", { aiHistory: [] });
    mocks.settings.mockRejectedValue(new Error(`timeout leyendo ${QUESTION}`));
    const send = vi.fn();
    await handleIncoming(JID, QUESTION, send, opts);
    expect(send.mock.calls).toEqual([[messages.AI_ERROR]]);
    expect(mocks.error).toHaveBeenCalledWith({ errName: "Error" }, "Error de base en el modo pregunta");
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain(QUESTION);
    expect(mocks.count).not.toHaveBeenCalled();
    expect(answer).not.toHaveBeenCalled();
    expect(mocks.saveState).toHaveBeenCalledWith(JID, "AWAIT_QUESTION", { aiHistory: [] });
  });

  it("derivar con 0 marca la pregunta con el consultorio de la conversación", async () => {
    inState("AWAIT_QUESTION", { aiHistory: [], lastQuestion: QUESTION, lastQuestionLogId: "q-9" });
    const send = vi.fn();
    await handleIncoming(JID, "0", send, opts);
    expect(mocks.markHandedOff).toHaveBeenCalledWith({ id: "q-9", patientId: "patient-a", tenantId: "tenant-a", at: NOW });
  });

  it("la opción 5 depende de la profesional del consultorio", async () => {
    inState("DORMANT");
    mocks.tenantProfessional.mockResolvedValue({ ...PRO_A, botAiEnabled: false });
    const off = vi.fn();
    await handleIncoming(JID, "menu", off, opts);
    expect(off.mock.calls).toEqual([[messages.welcomeBack("Ana", messages.menu({ withQuestions: false }))]]);

    mocks.tenantProfessional.mockResolvedValue(PRO_A);
    const on = vi.fn();
    await handleIncoming(JID, "menu", on, opts);
    expect(on.mock.calls).toEqual([[messages.welcomeBack("Ana", messages.menu({ withQuestions: true }))]]);
    expect(mocks.tenantProfessional.mock.calls).toEqual([["tenant-a"], ["tenant-a"]]);
  });
});
