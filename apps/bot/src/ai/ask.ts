// HU-012: orquestación de UNA pregunta al asistente (testeable sin base: todo entra por deps).
import {
  BOT_AI_REPLY_MAX_CHARS,
  BOT_AI_SYSTEM_PROMPT,
  BOT_AI_TOOLS,
  buildQuestionMessage,
  classifyAnswer,
  cutAtSentence,
  messages,
  toWhatsAppText,
  validateQuestion,
  type AiTurn,
  type BotAiLimits,
} from "@nutri-bot/core";
import type { BotAiOutcome } from "@nutri-bot/db";
import type { BotAiQuestionInput, BotAiToolResult } from "@nutri-bot/db/domain";
import { BotAiError, ZERO_USAGE, type AiUsage, type BotAiErrorKind, type BotAiProvider } from "./provider";

export type AskDeps = {
  provider: BotAiProvider;
  limits: BotAiLimits;
  countToday: () => Promise<{ patient: number; global: number }>;
  /** `question` la pone answerQuestion (la recortada). */
  record: (row: Omit<BotAiQuestionInput, "patientId" | "askedAt">) => Promise<{ id: string }>;
  runTool: (name: string, input: Record<string, unknown>) => Promise<BotAiToolResult>;
  log: { warn: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void };
  /** Default Date.now. */
  clock?: () => number;
};

export type AskResult = {
  /** Lo que se le manda al paciente. */
  reply: string;
  outcome: BotAiOutcome | "TOO_LONG";
  /** null en TOO_LONG. */
  logId: string | null;
  /** Vuelta para el historial (null salvo ANSWERED/HANDOFF_OFFERED/TRUNCATED con texto). */
  turn: AiTurn | null;
  /** Pregunta "derivable" con 0 (null en TOO_LONG). */
  question: string | null;
};

/** Debajo de esto, una respuesta cortada por max_tokens no sirve: se manda AI_ERROR. */
const MIN_TRUNCATED_CHARS = 40;

export async function answerQuestion(
  deps: AskDeps,
  input: { text: string; history: AiTurn[]; now: Date; tz: string; professionalName: string },
): Promise<AskResult> {
  const { provider, limits, log } = deps;
  const clock = deps.clock ?? Date.now;
  const question = input.text.trim();

  // 1. Largo (y vacío): no cuenta, no registra, no llama.
  if (validateQuestion(question, limits.maxQuestionChars) !== "ok") {
    return { reply: messages.AI_TOO_LONG, outcome: "TOO_LONG", logId: null, turn: null, question: null };
  }

  // 2. Límites diarios.
  const counts = await deps.countToday();
  if (counts.patient >= limits.perPatientDaily || counts.global >= limits.globalDaily) {
    const byPatient = counts.patient >= limits.perPatientDaily;
    if (!byPatient) log.warn({ global: counts.global }, "Tope global diario de preguntas a la IA");
    const { id } = await deps.record({
      question,
      answer: null,
      outcome: byPatient ? "LIMIT_PATIENT" : "LIMIT_GLOBAL",
      provider: provider.name,
      model: provider.model,
    });
    return {
      reply: byPatient ? messages.AI_DAILY_LIMIT : messages.AI_UNAVAILABLE,
      outcome: byPatient ? "LIMIT_PATIENT" : "LIMIT_GLOBAL",
      logId: id,
      turn: null,
      question,
    };
  }

  // 3. Llamada al proveedor.
  const t0 = clock();
  let reply: string;
  let outcome: BotAiOutcome;
  let turn: AiTurn | null = null;
  let usage: AiUsage = { ...ZERO_USAGE };
  let toolRounds = 0;
  let errorKind: BotAiErrorKind | null = null;
  try {
    const res = await provider.answer({
      system: BOT_AI_SYSTEM_PROMPT,
      tools: BOT_AI_TOOLS,
      history: input.history,
      userText: buildQuestionMessage({
        question,
        now: input.now,
        tz: input.tz,
        professionalName: input.professionalName,
      }),
      runTool: deps.runTool,
      maxTokens: limits.maxTokens,
      maxToolRounds: limits.maxToolRounds,
      timeoutMs: limits.timeoutMs,
      deadlineAt: t0 + limits.deadlineMs,
    });
    usage = res.usage;
    toolRounds = res.toolRounds;
    switch (res.kind) {
      case "answer":
        reply = toWhatsAppText(res.text);
        outcome = classifyAnswer(reply);
        turn = { question, answer: reply };
        break;
      case "truncated": {
        const cut = cutAtSentence(toWhatsAppText(res.text), BOT_AI_REPLY_MAX_CHARS);
        outcome = "TRUNCATED";
        if (cut.length < MIN_TRUNCATED_CHARS) {
          reply = messages.AI_ERROR;
        } else {
          reply = cut + messages.AI_TRUNCATED_SUFFIX;
          turn = { question, answer: reply };
        }
        break;
      }
      case "refusal":
        reply = messages.AI_OFF_TOPIC;
        outcome = "REFUSED";
        break;
      case "tool_limit":
        reply = messages.AI_ERROR;
        outcome = "TOOL_LIMIT";
        log.warn({ toolRounds }, "La IA superó el tope de vueltas de tools");
        break;
    }
  } catch (err) {
    // Nunca se loggea la pregunta, la respuesta, err.message ni el objeto err.
    const e = err instanceof BotAiError ? err : new BotAiError("unknown", ZERO_USAGE, 0);
    usage = e.usage;
    toolRounds = e.toolRounds;
    errorKind = e.kind;
    reply = messages.AI_ERROR;
    outcome = "ERROR";
    turn = null;
    if (e.kind === "auth") log.error({ kind: e.kind }, "IA del bot: clave inválida o sin permiso");
    else log.warn({ kind: e.kind }, "IA del bot: error del proveedor");
  }

  // 4. Registro.
  const { id } = await deps.record({
    question,
    answer: reply,
    outcome,
    provider: provider.name,
    model: provider.model,
    ...usage,
    toolRounds,
    latencyMs: clock() - t0,
    errorKind,
  });
  return { reply, outcome, logId: id, turn, question };
}
