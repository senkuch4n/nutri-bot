// HU-025 (025b-2 M8): el asistente arma el prompt y corre las herramientas con el contexto de la sesión.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ctx: vi.fn(), professional: vi.fn(), create: vi.fn(),
  buscarPaciente: vi.fn(), resumenPaciente: vi.fn(), turnosAgenda: vi.fn(), resumenFacturacion: vi.fn(),
  recordPanelAiUsage: vi.fn(),
}));
vi.mock("@/lib/tenant-context", () => ({ requireTenantContext: mocks.ctx }));
vi.mock("@/lib/professional", () => ({ getTenantProfessional: mocks.professional }));
vi.mock("@/lib/deepseek", () => ({
  DEEPSEEK_MODEL: "test", DEEPSEEK_PROVIDER: "deepseek",
  deepseekClient: () => ({ chat: { completions: { create: mocks.create } } }),
}));
vi.mock("@nutri-bot/db/domain", () => ({ recordPanelAiUsage: mocks.recordPanelAiUsage }));
vi.mock("@/lib/assistant-tools", () => ({
  buscarPaciente: mocks.buscarPaciente, resumenPaciente: mocks.resumenPaciente,
  turnosAgenda: mocks.turnosAgenda, resumenFacturacion: mocks.resumenFacturacion,
}));

import { askAssistantAction } from "./actions";

const CTX_A = { userId: "u-a", tenantId: "tenant-a", agendaId: "agenda-a", professionalId: 1 };

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.ctx.mockResolvedValue(CTX_A);
  mocks.professional.mockResolvedValue({ name: "Profesional A", timezone: "UTC" });
  mocks.recordPanelAiUsage.mockResolvedValue(undefined);
});

describe("askAssistantAction", () => {
  it("las herramientas reciben el contexto aunque la IA pida otro tenant, y el prompt no trae datos de B", async () => {
    mocks.buscarPaciente.mockResolvedValue([{ id: "p-a", nombre: "Paciente de A" }]);
    mocks.create
      .mockResolvedValueOnce({ choices: [{ message: { content: null, tool_calls: [{
        id: "c1", type: "function", function: { name: "buscar_paciente", arguments: JSON.stringify({ query: "Bruno", tenantId: "tenant-b" }) },
      }] } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: "Listo" } }] });
    const res = await askAssistantAction([], "¿Quién es Bruno?");
    expect(res).toMatchObject({ ok: true });
    expect(mocks.ctx).toHaveBeenCalledWith("read");
    expect(mocks.professional).toHaveBeenCalledWith("tenant-a");
    expect(mocks.buscarPaciente).toHaveBeenCalledWith(CTX_A, "Bruno");
    const sent = mocks.create.mock.calls.at(-1)![0].messages as { role: string; content: string | null }[];
    expect(sent[0]!.content).toContain("Profesional A");
    // Lo que el servidor agrega (system + resultados de tools) sale solo del consultorio A.
    const serverAdded = JSON.stringify(sent.filter((m) => m.role === "system" || m.role === "tool"));
    expect(serverAdded).toContain("Paciente de A");
    expect(serverAdded).not.toContain("tenant-b");
  });

  it("sin contexto: no llama a DeepSeek", async () => {
    mocks.ctx.mockRejectedValue(new Error("tenant_access:no_context"));
    const res = await askAssistantAction([], "hola");
    expect(res).toMatchObject({ ok: false });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.professional).not.toHaveBeenCalled();
  });

  it("D11: un error del proveedor no se devuelve ni se loguea con su mensaje", async () => {
    mocks.create.mockRejectedValue(Object.assign(new Error("401 Incorrect API key sk-secreta; prompt: Ana con diabetes"), { name: "AuthenticationError" }));
    const res = await askAssistantAction([], "¿Cómo está Ana?");
    expect(res).toEqual({ ok: false, error: "Error consultando al asistente", messages: [] });
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("AuthenticationError");
    expect(logged).not.toContain("sk-secreta");
    expect(logged).not.toContain("Ana");
  });
});

describe("askAssistantAction: registro de consumo (HU-028c, D11b, D12)", () => {
  const QUESTION = "¿Cómo viene Ana Pérez con el plan?";
  const ANSWER = "Ana Pérez bajó 2 kg.";
  const toolTurn = (id: string) => ({
    choices: [{ message: { content: null, tool_calls: [{ id, type: "function", function: { name: "buscar_paciente", arguments: "{\"query\":\"Ana\"}" } }] } }],
    usage: { prompt_tokens: 100, completion_tokens: 10 },
  });

  it("dos vueltas (tool + final) → un registro OK con tokens y llamadas sumados, del consultorio de la sesión", async () => {
    mocks.buscarPaciente.mockResolvedValue([{ id: "p-a", nombre: "Ana Pérez" }]);
    mocks.create
      .mockResolvedValueOnce(toolTurn("c1"))
      .mockResolvedValueOnce({ choices: [{ message: { content: ANSWER } }], usage: { prompt_tokens: 150, completion_tokens: 20 } });
    const res = await askAssistantAction([], QUESTION);
    expect(res).toMatchObject({ ok: true });
    expect(mocks.recordPanelAiUsage.mock.calls).toEqual([[CTX_A, {
      feature: "ASSISTANT", provider: "deepseek", model: "test",
      inputTokens: 250, outputTokens: 30, calls: 2, outcome: "OK", errorCode: undefined,
    }]]);
    const recorded = JSON.stringify(mocks.recordPanelAiUsage.mock.calls);
    expect(recorded).not.toContain("Ana");
    expect(recorded).not.toContain("bajó");
  });

  it("el proveedor tira → ERROR con el código, misma respuesta al cliente", async () => {
    mocks.create.mockRejectedValue(Object.assign(new Error("429 rate limit; prompt: Ana"), { name: "RateLimitError" }));
    const res = await askAssistantAction([], QUESTION);
    expect(res).toEqual({ ok: false, error: "Error consultando al asistente", messages: [] });
    expect(mocks.recordPanelAiUsage.mock.calls).toEqual([[CTX_A, {
      feature: "ASSISTANT", provider: "deepseek", model: "test",
      inputTokens: 0, outputTokens: 0, calls: 0, outcome: "ERROR", errorCode: "RateLimitError",
    }]]);
  });

  it("4 vueltas de tools sin respuesta final → TOOL_LIMIT", async () => {
    mocks.buscarPaciente.mockResolvedValue([]);
    mocks.create.mockResolvedValue(toolTurn("c"));
    const res = await askAssistantAction([], QUESTION);
    expect(res).toEqual({ ok: false, error: "El asistente no pudo resolver la consulta.", messages: [] });
    expect(mocks.recordPanelAiUsage).toHaveBeenCalledTimes(1);
    expect(mocks.recordPanelAiUsage.mock.calls[0]![1]).toMatchObject({ outcome: "TOOL_LIMIT", calls: 4, inputTokens: 400, outputTokens: 40 });
  });

  it("respuesta sin mensaje → INVALID_RESPONSE", async () => {
    mocks.create.mockResolvedValue({ choices: [], usage: { prompt_tokens: 50, completion_tokens: 0 } });
    const res = await askAssistantAction([], QUESTION);
    expect(res).toEqual({ ok: false, error: "El asistente no pudo resolver la consulta.", messages: [] });
    expect(mocks.recordPanelAiUsage.mock.calls[0]![1]).toMatchObject({ outcome: "INVALID_RESPONSE", calls: 1, inputTokens: 50 });
  });

  it("pregunta vacía o sin contexto → no registra", async () => {
    await askAssistantAction([], "   ");
    mocks.ctx.mockRejectedValue(new Error("tenant_access:no_context"));
    await askAssistantAction([], QUESTION);
    expect(mocks.recordPanelAiUsage).not.toHaveBeenCalled();
  });

  it("la respuesta al cliente no depende del registro", async () => {
    mocks.create.mockResolvedValue({ choices: [{ message: { content: ANSWER } }] });
    const withRecord = await askAssistantAction([], QUESTION);
    expect(mocks.recordPanelAiUsage).toHaveBeenCalledTimes(1);
    expect(withRecord).toEqual({
      ok: true,
      messages: [{ role: "user", content: QUESTION }, { role: "assistant", content: ANSWER }],
    });
  });
});
