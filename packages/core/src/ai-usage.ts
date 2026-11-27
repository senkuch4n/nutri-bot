// HU-028c (D11b, D12): suma del consumo de la IA del panel (tokens y respuestas recibidas). Pura.

export type ChatUsageTotals = { inputTokens: number; outputTokens: number; calls: number };

export const EMPTY_CHAT_USAGE: ChatUsageTotals = Object.freeze({ inputTokens: 0, outputTokens: 0, calls: 0 });

function tokens(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0;
}

/** Suma una respuesta recibida: calls + 1 y los tokens de `usage` (null/undefined/negativos/no finitos → 0,
 *  enteros por Math.trunc). Devuelve un objeto nuevo. */
export function addChatUsage(
  acc: ChatUsageTotals,
  usage: { prompt_tokens?: number | null; completion_tokens?: number | null } | null | undefined,
): ChatUsageTotals {
  return {
    inputTokens: acc.inputTokens + tokens(usage?.prompt_tokens),
    outputTokens: acc.outputTokens + tokens(usage?.completion_tokens),
    calls: acc.calls + 1,
  };
}
