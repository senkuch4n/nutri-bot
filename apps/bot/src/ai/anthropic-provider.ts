// HU-012 (D1): proveedor Claude (Haiku 4.5 por defecto) con loop manual de tools de solo lectura.
// Sin `thinking` ni `output_config` (Haiku 4.5 no admite `effort`).
import Anthropic from "@anthropic-ai/sdk";
import {
  addUsage,
  BotAiError,
  MIN_REMAINING_MS,
  ZERO_USAGE,
  type AiUsage,
  type BotAiProvider,
} from "./provider";

/** Timeout por defecto del cliente (ms). Cada llamada lo acota además por el deadline. */
const CLIENT_TIMEOUT_MS = 20_000;

function usageFrom(u: Anthropic.Usage): AiUsage {
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
  };
}

/** Clases tipadas del SDK, de la más específica a la más general. Nunca por el texto del mensaje. */
export function toBotAiError(err: unknown, usage: AiUsage, rounds: number): BotAiError {
  if (err instanceof BotAiError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new BotAiError("auth", usage, rounds);
  }
  if (err instanceof Anthropic.RateLimitError) return new BotAiError("rate_limit", usage, rounds);
  if (err instanceof Anthropic.BadRequestError) return new BotAiError("bad_request", usage, rounds);
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new BotAiError("timeout", usage, rounds);
  if (err instanceof Anthropic.APIConnectionError) return new BotAiError("connection", usage, rounds);
  if (err instanceof Anthropic.APIError) return new BotAiError("api", usage, rounds);
  return new BotAiError("unknown", usage, rounds);
}

/** `client` solo para tests (un objeto con `messages.create` falso). En producción se crea con la clave. */
export function createAnthropicProvider(p: {
  apiKey: string;
  model: string;
  client?: Pick<Anthropic, "messages">;
}): BotAiProvider {
  const client =
    p.client ?? new Anthropic({ apiKey: p.apiKey, timeout: CLIENT_TIMEOUT_MS, maxRetries: 0 });
  const model = p.model;

  return {
    name: "anthropic",
    model,
    async answer({ system, tools: specs, history, userText, runTool, maxTokens, maxToolRounds, timeoutMs, deadlineAt }) {
      const tools = specs.map(
        (t): Anthropic.Tool => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
          strict: true,
        }),
      );
      const messages: Anthropic.MessageParam[] = [];
      for (const turn of history) {
        messages.push({ role: "user", content: turn.question });
        messages.push({ role: "assistant", content: turn.answer });
      }
      messages.push({ role: "user", content: userText });

      let usage: AiUsage = { ...ZERO_USAGE };
      let rounds = 0;
      for (;;) {
        const remaining = deadlineAt - Date.now();
        if (remaining < MIN_REMAINING_MS) throw new BotAiError("timeout", usage, rounds);
        let res: Anthropic.Message;
        try {
          res = await client.messages.create(
            {
              model,
              max_tokens: maxTokens,
              system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
              tools,
              messages,
            },
            { timeout: Math.min(timeoutMs, remaining) },
          );
        } catch (err) {
          throw toBotAiError(err, usage, rounds);
        }
        usage = addUsage(usage, usageFrom(res.usage));

        if (res.stop_reason === "tool_use") {
          if (rounds >= maxToolRounds) return { kind: "tool_limit", text: "", usage, toolRounds: rounds };
          rounds++;
          messages.push({ role: "assistant", content: res.content });
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const block of res.content) {
            if (block.type !== "tool_use") continue;
            const b: Anthropic.ToolUseBlock = block;
            // `input` ya viene parseado: se usa como objeto, nunca se compara el JSON serializado.
            const input =
              b.input && typeof b.input === "object" ? (b.input as Record<string, unknown>) : {};
            const r = await runTool(b.name, input);
            results.push({
              type: "tool_result",
              tool_use_id: b.id,
              content: r.content,
              ...(r.isError ? { is_error: true } : {}),
            });
          }
          // TODOS los resultados en UN solo mensaje user.
          messages.push({ role: "user", content: results });
          continue;
        }

        const text = res.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        if (res.stop_reason === "max_tokens") return { kind: "truncated", text, usage, toolRounds: rounds };
        if (res.stop_reason === "refusal") return { kind: "refusal", text: "", usage, toolRounds: rounds };
        if (res.stop_reason === "end_turn" || res.stop_reason === "stop_sequence") {
          if (!text) throw new BotAiError("empty", usage, rounds);
          return { kind: "answer", text, usage, toolRounds: rounds };
        }
        throw new BotAiError("unexpected_stop", usage, rounds);
      }
    },
  };
}
