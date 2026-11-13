import Anthropic from "@anthropic-ai/sdk";
import { BOT_AI_TOOLS } from "@nutri-bot/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAnthropicProvider } from "./anthropic-provider";
import { BotAiError } from "./provider";

// Cliente falso: nunca se llama a la API real.
const create = vi.fn();
const client = { messages: { create } } as unknown as Pick<Anthropic, "messages">;
const provider = createAnthropicProvider({ apiKey: "test", model: "claude-haiku-4-5", client });

type FakeUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
};

function msg(
  stop_reason: Anthropic.StopReason,
  content: unknown[],
  usage: FakeUsage = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: null, cache_read_input_tokens: null },
) {
  return { id: "msg", type: "message", role: "assistant", model: "claude-haiku-4-5", stop_reason, content, usage };
}
const text = (t: string) => ({ type: "text", text: t, citations: null });
const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });

const runTool = vi.fn();

function ask(overrides: Partial<Parameters<typeof provider.answer>[0]> = {}) {
  return provider.answer({
    system: "SYS",
    tools: BOT_AI_TOOLS,
    history: [],
    userText: "pregunta",
    runTool,
    maxTokens: 300,
    maxToolRounds: 4,
    timeoutMs: 20_000,
    deadlineAt: Date.now() + 30_000,
    ...overrides,
  });
}

function sdkError<T extends object>(cls: { prototype: T }): T {
  return Object.create(cls.prototype) as T;
}

beforeEach(() => {
  create.mockReset();
  runTool.mockReset();
  runTool.mockResolvedValue({ content: "[]", isError: false });
});

describe("createAnthropicProvider", () => {
  it("end_turn directo: params correctos y sin thinking/output_config", async () => {
    create.mockResolvedValueOnce(msg("end_turn", [text("Hola, sale $ 25.000.")]));
    const r = await ask();
    expect(r).toEqual({
      kind: "answer",
      text: "Hola, sale $ 25.000.",
      usage: { inputTokens: 10, outputTokens: 5, cacheCreationTokens: 0, cacheReadTokens: 0 },
      toolRounds: 0,
    });
    expect(create).toHaveBeenCalledTimes(1);
    const [params, opts] = create.mock.calls[0]!;
    expect(params.model).toBe("claude-haiku-4-5");
    expect(params.max_tokens).toBe(300);
    expect(params.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(params.system[0].text).toBe("SYS");
    expect(params.tools).toHaveLength(4);
    for (const t of params.tools) {
      expect(t.strict).toBe(true);
      expect(t.input_schema.additionalProperties).toBe(false);
    }
    expect(params).not.toHaveProperty("thinking");
    expect(params).not.toHaveProperty("output_config");
    expect(params).not.toHaveProperty("tool_choice");
    expect(opts.timeout).toBeLessThanOrEqual(20_000);
    expect(opts.timeout).toBeGreaterThan(0);
  });

  it("historial → user/assistant alternados y el último es userText", async () => {
    create.mockResolvedValueOnce(msg("end_turn", [text("ok")]));
    await ask({
      history: [
        { question: "q1", answer: "a1" },
        { question: "q2", answer: "a2" },
      ],
      userText: "q3",
    });
    const m = create.mock.calls[0]![0].messages;
    expect(m.map((x: { role: string }) => x.role)).toEqual(["user", "assistant", "user", "assistant", "user"]);
    expect(m.map((x: { content: unknown }) => x.content)).toEqual(["q1", "a1", "q2", "a2", "q3"]);
  });

  it("2 tool_use en una vuelta → todos los tool_result en UN mensaje user, en orden", async () => {
    create
      .mockResolvedValueOnce(
        msg("tool_use", [text("Busco"), toolUse("tu_1", "servicios", {}), toolUse("tu_2", "mis_turnos", { patientId: "x" })]),
      )
      .mockResolvedValueOnce(msg("end_turn", [text("Listo")]));
    runTool
      .mockResolvedValueOnce({ content: "S", isError: false })
      .mockResolvedValueOnce({ content: "falló", isError: true });
    const r = await ask();
    expect(r.kind).toBe("answer");
    expect(r.toolRounds).toBe(1);
    expect(runTool.mock.calls).toEqual([
      ["servicios", {}],
      ["mis_turnos", { patientId: "x" }],
    ]);
    const second = create.mock.calls[1]![0].messages;
    expect(second.at(-2).role).toBe("assistant");
    const last = second.at(-1);
    expect(last.role).toBe("user");
    expect(last.content).toEqual([
      { type: "tool_result", tool_use_id: "tu_1", content: "S" },
      { type: "tool_result", tool_use_id: "tu_2", content: "falló", is_error: true },
    ]);
  });

  it("suma usage de todas las vueltas", async () => {
    create
      .mockResolvedValueOnce(
        msg("tool_use", [toolUse("tu_1", "servicios", {})], {
          input_tokens: 100,
          output_tokens: 20,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
        }),
      )
      .mockResolvedValueOnce(
        msg("end_turn", [text("ok")], {
          input_tokens: 300,
          output_tokens: 50,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 10,
        }),
      );
    const r = await ask();
    expect(r.usage).toEqual({ inputTokens: 400, outputTokens: 70, cacheCreationTokens: 0, cacheReadTokens: 10 });
  });

  it("más vueltas de tools que el tope → tool_limit (5 llamadas con tope 4)", async () => {
    create.mockResolvedValue(msg("tool_use", [toolUse("tu", "servicios", {})]));
    const r = await ask({ maxToolRounds: 4 });
    expect(r.kind).toBe("tool_limit");
    expect(r.text).toBe("");
    expect(r.toolRounds).toBe(4);
    expect(create).toHaveBeenCalledTimes(5);
  });

  it("max_tokens → truncated con texto parcial; refusal → texto vacío", async () => {
    create.mockResolvedValueOnce(msg("max_tokens", [text("La antropometría sale")]));
    expect(await ask()).toMatchObject({ kind: "truncated", text: "La antropometría sale" });
    create.mockResolvedValueOnce(msg("refusal", [text("algo")]));
    expect(await ask()).toMatchObject({ kind: "refusal", text: "" });
  });

  it("end_turn sin texto → BotAiError empty; stop_reason raro → unexpected_stop", async () => {
    create.mockResolvedValueOnce(msg("end_turn", []));
    await expect(ask()).rejects.toMatchObject({ kind: "empty" });
    create.mockResolvedValueOnce(msg("pause_turn", [text("x")]));
    await expect(ask()).rejects.toMatchObject({ kind: "unexpected_stop" });
  });

  it("deadline vencido → timeout sin llamar al cliente", async () => {
    const p = ask({ deadlineAt: Date.now() + 500 });
    await expect(p).rejects.toBeInstanceOf(BotAiError);
    await expect(ask({ deadlineAt: Date.now() - 1 })).rejects.toMatchObject({ kind: "timeout" });
    expect(create).not.toHaveBeenCalled();
  });

  it("errores del SDK mapeados por clase", async () => {
    const cases: [unknown, string][] = [
      [sdkError(Anthropic.RateLimitError), "rate_limit"],
      [sdkError(Anthropic.AuthenticationError), "auth"],
      [sdkError(Anthropic.PermissionDeniedError), "auth"],
      [sdkError(Anthropic.BadRequestError), "bad_request"],
      [sdkError(Anthropic.APIConnectionTimeoutError), "timeout"],
      [sdkError(Anthropic.APIConnectionError), "connection"],
      [sdkError(Anthropic.InternalServerError), "api"],
      [new Error("x"), "unknown"],
    ];
    for (const [err, kind] of cases) {
      create.mockReset();
      create.mockRejectedValueOnce(err);
      await expect(ask(), kind).rejects.toMatchObject({ kind });
    }
  });

  it("el usage de vueltas previas viaja en el error", async () => {
    create
      .mockResolvedValueOnce(
        msg("tool_use", [toolUse("tu_1", "servicios", {})], {
          input_tokens: 100,
          output_tokens: 20,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
        }),
      )
      .mockRejectedValueOnce(sdkError(Anthropic.RateLimitError));
    const err = await ask().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BotAiError);
    expect((err as BotAiError).usage.inputTokens).toBe(100);
    expect((err as BotAiError).toolRounds).toBe(1);
  });
});
