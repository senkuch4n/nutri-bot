import OpenAI from "openai";
import { BOT_AI_TOOLS } from "@nutri-bot/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDeepSeekProvider } from "./deepseek-provider";

// Cliente falso: nunca se llama a la API real.
const create = vi.fn();
const client = { chat: { completions: { create } } } as unknown as Pick<OpenAI, "chat">;
const provider = createDeepSeekProvider({ apiKey: "test", model: "deepseek-chat", client });
const runTool = vi.fn();

function completion(
  finish_reason: string,
  message: { content: string | null; tool_calls?: unknown[] },
  usage: Record<string, number> = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
) {
  return { id: "c", choices: [{ index: 0, finish_reason, message: { role: "assistant", ...message } }], usage };
}
const call = (id: string, name: string, args: string) => ({ id, type: "function", function: { name, arguments: args } });

function ask() {
  return provider.answer({
    system: "SYS",
    tools: BOT_AI_TOOLS,
    history: [{ question: "q1", answer: "a1" }],
    userText: "q2",
    runTool,
    maxTokens: 300,
    maxToolRounds: 4,
    timeoutMs: 20_000,
    deadlineAt: Date.now() + 30_000,
  });
}

beforeEach(() => {
  create.mockReset();
  runTool.mockReset();
  runTool.mockResolvedValue({ content: "OK", isError: false });
});

describe("createDeepSeekProvider", () => {
  it("tool_calls con 2 llamadas → 2 mensajes role tool; argumentos inválidos → error y sigue", async () => {
    create
      .mockResolvedValueOnce(
        completion("tool_calls", {
          content: null,
          tool_calls: [call("c1", "servicios", "{}"), call("c2", "disponibilidad", "{no es json")],
        }),
      )
      .mockResolvedValueOnce(completion("stop", { content: "Sale $ 25.000." }));
    const r = await ask();
    expect(r).toMatchObject({ kind: "answer", text: "Sale $ 25.000.", toolRounds: 1 });
    expect(runTool).toHaveBeenCalledTimes(1);
    expect(runTool).toHaveBeenCalledWith("servicios", {});
    const msgs = create.mock.calls[1]![0].messages;
    const tools = msgs.filter((m: { role: string }) => m.role === "tool");
    expect(tools).toEqual([
      { role: "tool", tool_call_id: "c1", content: "OK" },
      { role: "tool", tool_call_id: "c2", content: "ERROR: Argumentos inválidos." },
    ]);
    // system + historial + user al principio (el array se reusa entre vueltas: se miran los 4 primeros)
    expect(create.mock.calls[0]![0].messages.slice(0, 4).map((m: { role: string }) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
    const tool0 = create.mock.calls[0]![0].tools[0];
    expect(tool0.type).toBe("function");
    expect(tool0.function.name).toBe("servicios");
  });

  it("length → truncated; content_filter → refusal", async () => {
    create.mockResolvedValueOnce(completion("length", { content: "Texto parcial" }));
    expect(await ask()).toMatchObject({ kind: "truncated", text: "Texto parcial" });
    create.mockResolvedValueOnce(completion("content_filter", { content: "x" }));
    expect(await ask()).toMatchObject({ kind: "refusal", text: "" });
  });

  it("usage mapeado (prompt_cache_hit_tokens → cacheReadTokens)", async () => {
    create.mockResolvedValueOnce(
      completion("stop", { content: "ok" }, { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150, prompt_cache_hit_tokens: 64 }),
    );
    const r = await ask();
    expect(r.usage).toEqual({ inputTokens: 120, outputTokens: 30, cacheCreationTokens: 0, cacheReadTokens: 64 });
  });

  it("errores del SDK de OpenAI mapeados por clase", async () => {
    create.mockRejectedValueOnce(Object.create(OpenAI.RateLimitError.prototype));
    await expect(ask()).rejects.toMatchObject({ kind: "rate_limit" });
    create.mockRejectedValueOnce(Object.create(OpenAI.AuthenticationError.prototype));
    await expect(ask()).rejects.toMatchObject({ kind: "auth" });
    create.mockRejectedValueOnce(new Error("x"));
    await expect(ask()).rejects.toMatchObject({ kind: "unknown" });
  });
});
