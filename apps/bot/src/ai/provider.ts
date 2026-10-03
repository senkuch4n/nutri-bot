// HU-012: interfaz propia de proveedor de IA del bot. Cada adapter (Anthropic, DeepSeek, falso)
// la implementa; el resto del bot no conoce ningún SDK.
import type { AiTurn, BotAiToolSpec } from "@nutri-bot/core";
import type { BotAiToolResult } from "@nutri-bot/db/domain";

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
};

export const ZERO_USAGE: AiUsage = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
});

export type AiAnswer = {
  kind: "answer" | "truncated" | "refusal" | "tool_limit";
  /** Texto crudo del modelo (se limpia afuera). "" en refusal/tool_limit. */
  text: string;
  /** Suma de TODAS las vueltas. */
  usage: AiUsage;
  toolRounds: number;
};

export type BotAiErrorKind =
  | "auth"
  | "rate_limit"
  | "bad_request"
  | "timeout"
  | "connection"
  | "api"
  | "empty"
  | "unexpected_stop"
  | "unknown";

/** Único error que lanza un BotAiProvider. Nunca lleva el mensaje ni el request del proveedor. */
export class BotAiError extends Error {
  constructor(
    readonly kind: BotAiErrorKind,
    readonly usage: AiUsage,
    readonly toolRounds: number,
  ) {
    super(`BotAiError: ${kind}`);
    this.name = "BotAiError";
  }
}

export interface BotAiProvider {
  readonly name: "anthropic" | "deepseek" | "fake";
  readonly model: string;
  /** Lanza SOLO BotAiError. */
  answer(p: {
    system: string;
    tools: readonly BotAiToolSpec[];
    history: AiTurn[];
    userText: string;
    runTool: (name: string, input: Record<string, unknown>) => Promise<BotAiToolResult>;
    maxTokens: number;
    maxToolRounds: number;
    timeoutMs: number;
    /** Epoch ms: si queda < 1.000 ms antes de una llamada → BotAiError("timeout"). */
    deadlineAt: number;
  }): Promise<AiAnswer>;
}

/** Margen mínimo antes del deadline para hacer otra llamada al proveedor. */
export const MIN_REMAINING_MS = 1000;

export function addUsage(a: AiUsage, b: AiUsage): AiUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  };
}
