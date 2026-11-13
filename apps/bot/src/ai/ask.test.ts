import {
  BOT_AI_DEFAULT_LIMITS,
  BOT_AI_SYSTEM_PROMPT,
  buildQuestionMessage,
  messages,
} from "@nutri-bot/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerQuestion, type AskDeps } from "./ask";
import { BotAiError, type AiAnswer, type BotAiProvider } from "./provider";

const NOW = new Date("2026-10-02T15:00:00Z");
const TZ = "America/Argentina/Buenos_Aires";
const QUESTION = "¿cuánto sale la antropometría?";

const answer = vi.fn<BotAiProvider["answer"]>();
const provider: BotAiProvider = { name: "fake", model: "fake-1", answer };
const countToday = vi.fn<AskDeps["countToday"]>();
const record = vi.fn<AskDeps["record"]>();
const runTool = vi.fn<AskDeps["runTool"]>();
const log = { warn: vi.fn(), error: vi.fn() };
let ticks: number[];

function deps(): AskDeps {
  return {
    provider,
    limits: BOT_AI_DEFAULT_LIMITS,
    countToday,
    record,
    runTool,
    log,
    clock: () => ticks.shift() ?? 0,
  };
}

function run(text = QUESTION) {
  return answerQuestion(deps(), { text, history: [], now: NOW, tz: TZ, professionalName: "Lic. Daiana Ponce" });
}

const usage = { inputTokens: 500, outputTokens: 40, cacheCreationTokens: 0, cacheReadTokens: 0 };
const res = (kind: AiAnswer["kind"], text: string): AiAnswer => ({ kind, text, usage, toolRounds: 1 });

beforeEach(() => {
  vi.resetAllMocks();
  countToday.mockResolvedValue({ patient: 0, global: 0 });
  record.mockResolvedValue({ id: "log-1" });
  ticks = [1000, 1850];
});

describe("answerQuestion", () => {
  it("más de 500 caracteres → AI_TOO_LONG sin contar, registrar ni llamar", async () => {
    const r = await run("a".repeat(501));
    expect(r).toEqual({ reply: messages.AI_TOO_LONG, outcome: "TOO_LONG", logId: null, turn: null, question: null });
    expect(countToday).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
    expect(answer).not.toHaveBeenCalled();
  });

  it("tope del paciente → AI_DAILY_LIMIT, fila LIMIT_PATIENT, sin proveedor", async () => {
    countToday.mockResolvedValue({ patient: 20, global: 0 });
    const r = await run();
    expect(r.reply).toBe(messages.AI_DAILY_LIMIT);
    expect(r.outcome).toBe("LIMIT_PATIENT");
    expect(r.question).toBe(QUESTION);
    expect(r.turn).toBeNull();
    expect(record).toHaveBeenCalledWith({
      question: QUESTION,
      answer: null,
      outcome: "LIMIT_PATIENT",
      provider: "fake",
      model: "fake-1",
    });
    expect(answer).not.toHaveBeenCalled();
  });

  it("tope global → AI_UNAVAILABLE, LIMIT_GLOBAL y log.warn", async () => {
    countToday.mockResolvedValue({ patient: 0, global: 300 });
    const r = await run();
    expect(r.reply).toBe(messages.AI_UNAVAILABLE);
    expect(r.outcome).toBe("LIMIT_GLOBAL");
    expect(record.mock.calls[0]![0].outcome).toBe("LIMIT_GLOBAL");
    expect(log.warn).toHaveBeenCalledWith({ global: 300 }, "Tope global diario de preguntas a la IA");
    expect(answer).not.toHaveBeenCalled();
  });

  it("respuesta: limpia el formato, clasifica y registra tokens y latencia", async () => {
    answer.mockResolvedValue(res("answer", "**Antropometría**: $ 25.000. Si querés que se lo pase, respondé *0*."));
    const r = await run(`  ${QUESTION}  `);
    const clean = "*Antropometría*: $ 25.000. Si querés que se lo pase, respondé *0*.";
    expect(r).toEqual({
      reply: clean,
      outcome: "HANDOFF_OFFERED",
      logId: "log-1",
      turn: { question: QUESTION, answer: clean },
      question: QUESTION,
    });
    expect(record).toHaveBeenCalledWith({
      question: QUESTION,
      answer: clean,
      outcome: "HANDOFF_OFFERED",
      provider: "fake",
      model: "fake-1",
      ...usage,
      toolRounds: 1,
      latencyMs: 850,
      errorKind: null,
    });
  });

  it("le pasa al proveedor el prompt de sistema, el mensaje armado y los límites", async () => {
    answer.mockResolvedValue(res("answer", "Sale $ 25.000."));
    await run();
    const p = answer.mock.calls[0]![0];
    expect(p.system).toBe(BOT_AI_SYSTEM_PROMPT);
    expect(p.userText).toBe(buildQuestionMessage({ question: QUESTION, now: NOW, tz: TZ, professionalName: "Lic. Daiana Ponce" }));
    expect(p.tools).toHaveLength(4);
    expect(p.maxTokens).toBe(300);
    expect(p.maxToolRounds).toBe(4);
    expect(p.deadlineAt).toBe(1000 + 30_000);
    expect(p.runTool).toBe(runTool);
  });

  it("respuesta sin ofrecer 0 → ANSWERED", async () => {
    answer.mockResolvedValue(res("answer", "Sale $ 25.000 y dura 45 minutos."));
    expect((await run()).outcome).toBe("ANSWERED");
  });

  it("truncated largo → sufijo; truncated corto → AI_ERROR sin historial", async () => {
    answer.mockResolvedValue(res("truncated", "La antropometría sale $ 25.000 y dura 45 minutos. Además te pido que vengas"));
    const r = await run();
    expect(r.outcome).toBe("TRUNCATED");
    expect(r.reply.endsWith(messages.AI_TRUNCATED_SUFFIX)).toBe(true);
    expect(r.reply.startsWith("La antropometría sale $ 25.000 y dura 45 minutos.")).toBe(true);
    expect(r.turn).not.toBeNull();

    ticks = [0, 1];
    answer.mockResolvedValue(res("truncated", "La antrop"));
    const short = await run();
    expect(short).toMatchObject({ reply: messages.AI_ERROR, outcome: "TRUNCATED", turn: null });
  });

  it("refusal → AI_OFF_TOPIC; tool_limit → AI_ERROR + warn", async () => {
    answer.mockResolvedValue(res("refusal", ""));
    expect(await run()).toMatchObject({ reply: messages.AI_OFF_TOPIC, outcome: "REFUSED", turn: null });
    ticks = [0, 1];
    answer.mockResolvedValue(res("tool_limit", ""));
    expect(await run()).toMatchObject({ reply: messages.AI_ERROR, outcome: "TOOL_LIMIT", turn: null });
    expect(log.warn).toHaveBeenCalledWith({ toolRounds: 1 }, "La IA superó el tope de vueltas de tools");
  });

  it("BotAiError → AI_ERROR, errorKind y tokens del error; el log no lleva la pregunta", async () => {
    answer.mockRejectedValue(new BotAiError("rate_limit", { ...usage, inputTokens: 77 }, 1));
    const r = await run();
    expect(r).toMatchObject({ reply: messages.AI_ERROR, outcome: "ERROR", turn: null, question: QUESTION });
    expect(record.mock.calls[0]![0]).toMatchObject({ outcome: "ERROR", errorKind: "rate_limit", inputTokens: 77, toolRounds: 1 });
    expect(log.warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(log.warn.mock.calls);
    expect(logged).not.toContain("antropometr");
    expect(logged).toContain("rate_limit");
    expect(log.error).not.toHaveBeenCalled();
  });

  it("auth → log.error", async () => {
    answer.mockRejectedValue(new BotAiError("auth", usage, 0));
    await run();
    expect(log.error).toHaveBeenCalledWith({ kind: "auth" }, "IA del bot: clave inválida o sin permiso");
  });

  it("excepción cualquiera → ERROR unknown", async () => {
    answer.mockRejectedValue(new Error(`algo con ${QUESTION}`));
    const r = await run();
    expect(r.outcome).toBe("ERROR");
    expect(record.mock.calls[0]![0].errorKind).toBe("unknown");
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("antropometr");
  });
});
