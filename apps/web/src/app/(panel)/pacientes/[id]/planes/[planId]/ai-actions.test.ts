// HU-018b-2 (pendiente de la revisión de 018b-1): la IA relee el plan justo antes de reemplazar las
// comidas vacías. Todo mockeado: sin base y sin llamar a ninguna IA real.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPlan: vi.fn(), addMeal: vi.fn(), addMealItem: vi.fn(), deleteMeal: vi.fn(), completion: vi.fn(),
}));

// HU-025b-1: el consultorio sale del contexto de la sesión.
const TENANT_CTX = vi.hoisted(() => ({
  userId: "u", tenantId: "legacy-tenant", agendaId: "legacy-agenda", professionalId: 1,
  access: { kind: "member" as const, tenantId: "legacy-tenant", role: "OWNER" as const },
}));
vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: async () => TENANT_CTX,
  requirePageContext: async () => TENANT_CTX,
  getTenantContext: async () => TENANT_CTX,
  TenantAccessError: class TenantAccessError extends Error {},
}));
vi.mock("@nutri-bot/db/domain", () => ({
  ...mocks,
  listFoods: vi.fn().mockResolvedValue([
    { id: "sara", name: "SARA food", group: "FRUTAS", source: "SARA2", active: true, kcalPer100: 100 },
  ]),
  getLatestFormulaMeasurements: vi.fn().mockResolvedValue({ weightKg: null, heightCm: null }),
  getTenantProfessional: vi.fn().mockResolvedValue({ timezone: "UTC" }),
}));
vi.mock("@nutri-bot/db", () => ({ prisma: {
  patient: { findUnique: vi.fn().mockResolvedValue(null) },
  clinicalRecord: { findUnique: vi.fn().mockResolvedValue(null) },
} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/deepseek", () => ({ DEEPSEEK_MODEL: "test", deepseekClient: () => ({ chat: { completions: { create: mocks.completion } } }) }));

import { generateAiPlanAction } from "./ai-actions";

const emptyMeal = (id: string) => ({ id, name: id, mode: "PER_DAY", isOptions: false, items: [] });
const form = () => {
  const data = new FormData();
  data.set("planId", "plan");
  data.set("patientId", "patient");
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.addMeal.mockResolvedValue({ id: "new-meal" });
  mocks.completion.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
    meals: [{ name: "Desayuno", items: [{ ref: 1, quantityGrams: 100 }] }],
  }) } }] });
});

describe("generateAiPlanAction: releer antes de borrar", () => {
  it("borra las comidas que lee justo antes de crear, no las de la primera lectura", async () => {
    mocks.getPlan
      .mockResolvedValueOnce({ id: "plan", patientId: "patient", meals: [emptyMeal("a"), emptyMeal("b")] })
      .mockResolvedValueOnce({ id: "plan", patientId: "patient", meals: [emptyMeal("b")] });
    expect(await generateAiPlanAction({ ok: false }, form())).toEqual({ ok: true });
    expect(mocks.getPlan).toHaveBeenCalledTimes(2);
    expect(mocks.deleteMeal.mock.calls).toEqual([[TENANT_CTX, "b"]]);
    expect(mocks.addMeal).toHaveBeenCalledWith(TENANT_CTX, "plan", { name: "Desayuno", order: 0, mode: "EVERY_DAY" });
    expect(mocks.addMealItem).toHaveBeenCalledWith(TENANT_CTX, "new-meal", expect.objectContaining({ foodId: "sara", weekday: null }));
  });

  it("si mientras respondía la IA se cargó un ítem, no borra ni crea nada", async () => {
    mocks.getPlan
      .mockResolvedValueOnce({ id: "plan", patientId: "patient", meals: [emptyMeal("a")] })
      .mockResolvedValueOnce({ id: "plan", patientId: "patient", meals: [{ ...emptyMeal("a"), items: [{ id: "x" }] }] });
    expect(await generateAiPlanAction({ ok: false }, form())).toEqual({
      ok: false,
      error: "Este plan ya tiene comidas cargadas. Generá la propuesta en un plan vacío.",
    });
    expect(mocks.deleteMeal).not.toHaveBeenCalled();
    expect(mocks.addMeal).not.toHaveBeenCalled();
    expect(mocks.addMealItem).not.toHaveBeenCalled();
  });

  it("si el plan se borró mientras tanto, devuelve error sin crear comidas", async () => {
    mocks.getPlan.mockResolvedValueOnce({ id: "plan", patientId: "patient", meals: [] }).mockResolvedValueOnce(null);
    expect(await generateAiPlanAction({ ok: false }, form())).toEqual({ ok: false, error: "Plan no encontrado" });
    expect(mocks.addMeal).not.toHaveBeenCalled();
  });
});

describe("HU-025: IA de planes con un plan de otro consultorio", () => {
  it("getPlan con el contexto de A no encuentra el plan de B → rechazo sin llamar a DeepSeek", async () => {
    mocks.getPlan.mockResolvedValueOnce(null);
    expect(await generateAiPlanAction({ ok: false }, form())).toEqual({ ok: false, error: "Plan no encontrado" });
    expect(mocks.getPlan).toHaveBeenCalledWith(TENANT_CTX, "plan");
    expect(mocks.completion).not.toHaveBeenCalled();
    expect(mocks.addMeal).not.toHaveBeenCalled();
  });

  it("un plan propio de otra paciente (patientId del form distinto) → rechazo sin llamar a DeepSeek", async () => {
    mocks.getPlan.mockResolvedValueOnce({ id: "plan", patientId: "otra", meals: [] });
    expect(await generateAiPlanAction({ ok: false }, form())).toEqual({ ok: false, error: "Plan no encontrado" });
    expect(mocks.completion).not.toHaveBeenCalled();
  });
});

describe("HU-025 (D11): logs de la IA de planes", () => {
  it("un error del proveedor no llega al cliente ni al log con su mensaje (puede traer el prompt o la clave)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.getPlan.mockResolvedValue({ id: "plan", patientId: "patient", meals: [] });
      mocks.completion.mockRejectedValue(Object.assign(new Error("401 sk-secreta; paciente con diabetes"), { name: "AuthenticationError" }));
      expect(await generateAiPlanAction({ ok: false }, form())).toEqual({ ok: false, error: "Error consultando a la IA" });
      const logged = JSON.stringify(log.mock.calls);
      expect(logged).toContain("AuthenticationError");
      expect(logged).not.toMatch(/sk-secreta|diabetes/);
    } finally {
      log.mockRestore();
    }
  });
});
