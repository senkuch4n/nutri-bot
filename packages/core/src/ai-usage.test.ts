import { describe, expect, it } from "vitest";
import { addChatUsage, EMPTY_CHAT_USAGE } from "./ai-usage";

describe("addChatUsage (HU-028c)", () => {
  it("arranca en cero", () => {
    expect(EMPTY_CHAT_USAGE).toEqual({ inputTokens: 0, outputTokens: 0, calls: 0 });
  });

  it("suma dos respuestas", () => {
    const a = addChatUsage(EMPTY_CHAT_USAGE, { prompt_tokens: 100, completion_tokens: 20 });
    const b = addChatUsage(a, { prompt_tokens: 150, completion_tokens: 30 });
    expect(b).toEqual({ inputTokens: 250, outputTokens: 50, calls: 2 });
  });

  it("usage null/undefined → calls + 1 y tokens 0", () => {
    expect(addChatUsage(EMPTY_CHAT_USAGE, null)).toEqual({ inputTokens: 0, outputTokens: 0, calls: 1 });
    expect(addChatUsage(EMPTY_CHAT_USAGE, undefined)).toEqual({ inputTokens: 0, outputTokens: 0, calls: 1 });
    expect(addChatUsage(EMPTY_CHAT_USAGE, { prompt_tokens: null })).toEqual({ inputTokens: 0, outputTokens: 0, calls: 1 });
  });

  it("negativos, NaN o infinitos → 0; decimales se truncan", () => {
    expect(addChatUsage(EMPTY_CHAT_USAGE, { prompt_tokens: -5, completion_tokens: Number.NaN })).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      calls: 1,
    });
    expect(addChatUsage(EMPTY_CHAT_USAGE, { prompt_tokens: Infinity, completion_tokens: 3.9 })).toEqual({
      inputTokens: 0,
      outputTokens: 3,
      calls: 1,
    });
  });

  it("no muta acc", () => {
    const acc = { inputTokens: 1, outputTokens: 2, calls: 3 };
    const out = addChatUsage(acc, { prompt_tokens: 10, completion_tokens: 10 });
    expect(acc).toEqual({ inputTokens: 1, outputTokens: 2, calls: 3 });
    expect(out).not.toBe(acc);
  });
});
