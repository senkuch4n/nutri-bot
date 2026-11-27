import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    tenantAiSettings: { findUnique: vi.fn() },
    panelAiUsage: { create: vi.fn() },
  },
}));
vi.mock("../index", () => ({ prisma: mocks.prisma }));

import { getTenantAiSettings, recordPanelAiUsage, type PanelAiUsageInput } from "./aiUsage";

const A = { tenantId: "tenant-a" };
const ROW: PanelAiUsageInput = {
  feature: "ASSISTANT",
  provider: "deepseek",
  model: "deepseek-chat",
  inputTokens: 120,
  outputTokens: 30,
  calls: 2,
  outcome: "OK",
};

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("getTenantAiSettings (HU-028c)", () => {
  it("sin fila → nulls", async () => {
    mocks.prisma.tenantAiSettings.findUnique.mockResolvedValue(null);
    await expect(getTenantAiSettings(A)).resolves.toEqual({ botDailyPerPatient: null, botDailyPerTenant: null });
    expect(mocks.prisma.tenantAiSettings.findUnique).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a" },
      select: { botDailyPerPatient: true, botDailyPerTenant: true },
    });
  });

  it("con fila → sus valores", async () => {
    mocks.prisma.tenantAiSettings.findUnique.mockResolvedValue({ botDailyPerPatient: 5, botDailyPerTenant: null });
    await expect(getTenantAiSettings(A)).resolves.toEqual({ botDailyPerPatient: 5, botDailyPerTenant: null });
  });

  it("un error de base se propaga (el bot lo trata como error de conteo)", async () => {
    mocks.prisma.tenantAiSettings.findUnique.mockRejectedValue(new Error("db caída"));
    await expect(getTenantAiSettings(A)).rejects.toThrow("db caída");
  });
});

describe("recordPanelAiUsage (HU-028c)", () => {
  it("crea la fila del consultorio solo con los campos de consumo", async () => {
    mocks.prisma.panelAiUsage.create.mockResolvedValue({ id: "u1" });
    await expect(recordPanelAiUsage(A, ROW)).resolves.toBeUndefined();
    const arg = mocks.prisma.panelAiUsage.create.mock.calls[0]![0];
    expect(Object.keys(arg.data).sort()).toEqual(
      ["tenantId", "feature", "provider", "model", "inputTokens", "outputTokens", "calls", "outcome", "errorCode"].sort(),
    );
    expect(arg.data).toEqual({ ...ROW, tenantId: "tenant-a", errorCode: null });
  });

  it("con `at` agrega usedAt", async () => {
    mocks.prisma.panelAiUsage.create.mockResolvedValue({ id: "u1" });
    const at = new Date("2026-11-27T12:00:00Z");
    await recordPanelAiUsage(A, { ...ROW, at });
    expect(mocks.prisma.panelAiUsage.create.mock.calls[0]![0].data.usedAt).toEqual(at);
  });

  it("errorCode válido se guarda; con espacios o muy largo → \"error\"", async () => {
    mocks.prisma.panelAiUsage.create.mockResolvedValue({ id: "u1" });
    await recordPanelAiUsage(A, { ...ROW, outcome: "ERROR", errorCode: "ETIMEDOUT" });
    await recordPanelAiUsage(A, { ...ROW, outcome: "ERROR", errorCode: "rate limit hit" });
    await recordPanelAiUsage(A, { ...ROW, outcome: "ERROR", errorCode: "x".repeat(65) });
    const codes = mocks.prisma.panelAiUsage.create.mock.calls.map((c) => c[0].data.errorCode);
    expect(codes).toEqual(["ETIMEDOUT", "error", "error"]);
  });

  it("tokens o calls negativos o no enteros → 0", async () => {
    mocks.prisma.panelAiUsage.create.mockResolvedValue({ id: "u1" });
    await recordPanelAiUsage(A, { ...ROW, inputTokens: -1, outputTokens: 2.5, calls: Number.NaN });
    expect(mocks.prisma.panelAiUsage.create.mock.calls[0]![0].data).toMatchObject({
      inputTokens: 0,
      outputTokens: 0,
      calls: 0,
    });
  });

  it("nunca tira: ante error loguea solo el código, nunca el message", async () => {
    const err = Object.assign(new Error("password=hunter2 paciente Ana"), { code: "P2003" });
    mocks.prisma.panelAiUsage.create.mockRejectedValue(err);
    await expect(recordPanelAiUsage(A, ROW)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("[ai-usage] record_failed", "P2003");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("hunter2");
  });

  it("error sin código → la clase del error", async () => {
    mocks.prisma.panelAiUsage.create.mockRejectedValue(new TypeError("datos sensibles"));
    await expect(recordPanelAiUsage(A, ROW)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("[ai-usage] record_failed", "TypeError");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("sensibles");
  });
});
