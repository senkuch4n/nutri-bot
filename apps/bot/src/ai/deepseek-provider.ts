// HU-012 (D1): fallback DeepSeek (`BOT_AI_PROVIDER=deepseek`), API compatible con OpenAI.
// Mismo contrato y mismo loop de tools que el proveedor de Anthropic.
import OpenAI from "openai";
import {
  addUsage,
  BotAiError,
  MIN_REMAINING_MS,
  ZERO_USAGE,
  type AiUsage,
  type BotAiProvider,
} from "./provider";

const CLIENT_TIMEOUT_MS = 20_000;
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatTool = OpenAI.Chat.Completions.ChatCompletionFunctionTool;

function usageFrom(u: OpenAI.CompletionUsage | undefined): AiUsage {
  if (!u) return { ...ZERO_USAGE };
  // `prompt_cache_hit_tokens` es una extensión de DeepSeek: no está en los tipos de `openai`.
  const hit = (u as OpenAI.CompletionUsage & { prompt_cache_hit_tokens?: number }).prompt_cache_hit_tokens;
  return {
    inputTokens: u.prompt_tokens ?? 0,
    outputTokens: u.completion_tokens ?? 0,
    cacheCreationTokens: 0,
    cacheReadTokens: typeof hit === "number" ? hit : 0,
  };
}

export function toDeepSeekError(err: unknown, usage: AiUsage, rounds: number): BotAiError {
  if (err instanceof BotAiError) return err;
  if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) {
    return new BotAiError("auth", usage, rounds);
  }
  if (err instanceof OpenAI.RateLimitError) return new BotAiError("rate_limit", usage, rounds);
  if (err instanceof OpenAI.BadRequestError) return new BotAiError("bad_request", usage, rounds);
  if (err instanceof OpenAI.APIConnectionTimeoutError) return new BotAiError("timeout", usage, rounds);
  if (err instanceof OpenAI.APIConnectionError) return new BotAiError("connection", usage, rounds);
  if (err instanceof OpenAI.APIError) return new BotAiError("api", usage, rounds);
  return new BotAiError("unknown", usage, rounds);
}

export function createDeepSeekProvider(p: {
  apiKey: string;
  model: string;
  client?: Pick<OpenAI, "chat">;
}): BotAiProvider {
  const client =
    p.client ??
    new OpenAI({ apiKey: p.apiKey, baseURL: DEEPSEEK_BASE_URL, timeout: CLIENT_TIMEOUT_MS, maxRetries: 0 });
  const model = p.model;

  return {
    name: "deepseek",
    model,
    async answer({ system, tools: specs, history, userText, runTool, maxTokens, maxToolRounds, timeoutMs, deadlineAt }) {
      const tools: ChatTool[] = specs.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      }));
      const messages: ChatMessage[] = [{ role: "system", content: system }];
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
        let res: OpenAI.Chat.Completions.ChatCompletion;
        try {
          res = await client.chat.completions.create(
            { model, max_tokens: maxTokens, messages, tools },
            { timeout: Math.min(timeoutMs, remaining) },
          );
        } catch (err) {
          throw toDeepSeekError(err, usage, rounds);
        }
        usage = addUsage(usage, usageFrom(res.usage));
        const choice = res.choices[0];
        if (!choice) throw new BotAiError("empty", usage, rounds);
        const msg = choice.message;

        if (choice.finish_reason === "tool_calls") {
          if (rounds >= maxToolRounds) return { kind: "tool_limit", text: "", usage, toolRounds: rounds };
          rounds++;
          const calls = msg.tool_calls ?? [];
          messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
          for (const call of calls) {
            if (call.type !== "function") {
              messages.push({ role: "tool", tool_call_id: call.id, content: "ERROR: Herramienta desconocida." });
              continue;
            }
            let input: Record<string, unknown> | null = null;
            try {
              const parsed: unknown = JSON.parse(call.function.arguments || "{}");
              input = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
            } catch {
              input = null;
            }
            const r = input === null
              ? { content: "Argumentos inválidos.", isError: true }
              : await runTool(call.function.name, input);
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: r.isError ? `ERROR: ${r.content}` : r.content,
            });
          }
          continue;
        }

        const text = (msg.content ?? "").trim();
        if (choice.finish_reason === "length") return { kind: "truncated", text, usage, toolRounds: rounds };
        if (choice.finish_reason === "content_filter") return { kind: "refusal", text: "", usage, toolRounds: rounds };
        if (choice.finish_reason === "stop") {
          if (!text) throw new BotAiError("empty", usage, rounds);
          return { kind: "answer", text, usage, toolRounds: rounds };
        }
        throw new BotAiError("unexpected_stop", usage, rounds);
      }
    },
  };
}
