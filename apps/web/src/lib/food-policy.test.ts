import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  listFoods: vi.fn(), getPlan: vi.fn(), getTemplate: vi.fn(), getFood: vi.fn(),
  addMeal: vi.fn(), addMealItem: vi.fn(), addTemplateMealItem: vi.fn(),
  applyTemplateToPatient: vi.fn(), completion: vi.fn(),
  // HU-018b: el orden del ítem sale de nextItemOrder y la IA reemplaza las comidas vacías.
  nextItemOrder: vi.fn().mockResolvedValue(0), deleteMeal: vi.fn(),
  // HU-018b-2: la página del plan carga el objetivo (D7) y la consulta del aviso (D11).
  getPlanTarget: vi.fn().mockResolvedValue(null), getPlanConsultationId: vi.fn().mockResolvedValue(null),
  patient: vi.fn(), evolution: vi.fn(), clinical: vi.fn(),
}));

vi.mock("@nutri-bot/db/domain", () => ({
  ...mocks,
  getLatestFormulaMeasurements: vi.fn().mockResolvedValue({ weightKg: null, heightCm: null }),
}));
vi.mock("@nutri-bot/db", () => ({ prisma: {
  patient: { findUnique: mocks.patient, findUniqueOrThrow: mocks.patient },
  evolutionEntry: { findFirst: mocks.evolution },
  clinicalRecord: { findUnique: mocks.clinical },
  nutritionPlan: { findUnique: vi.fn().mockResolvedValue({ patientId: "patient" }) },
} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// HU-018c: la página del plan monta el buscador de recetas; sus actions no se usan en este test.
vi.mock("@/app/(panel)/recipe-picker-actions", () => ({}));
vi.mock("server-only", () => ({})); // lib/revalidate-menu-owner (HU-018c)
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/professional", () => ({ getProfessional: vi.fn().mockResolvedValue({ timezone: "UTC" }) }));
vi.mock("@/lib/deepseek", () => ({ DEEPSEEK_MODEL: "test", deepseekClient: () => ({ chat: { completions: { create: mocks.completion } } }) }));
vi.mock("@/lib/plan-pdf", () => ({ renderPlanPdf: vi.fn() }));

import PlanPage from "../app/(panel)/pacientes/[id]/planes/[planId]/page";
import TemplatePage from "../app/(panel)/plantillas/[id]/page";
import FoodsPage from "../app/(panel)/alimentos/page";
import { generateAiPlanAction } from "../app/(panel)/pacientes/[id]/planes/[planId]/ai-actions";
import { addPlanMealItemAction } from "../app/(panel)/pacientes/[id]/planes/[planId]/actions";
import { addTemplateMealItemAction } from "../app/(panel)/plantillas/actions";
import { applyTemplateAction } from "../app/(panel)/pacientes/[id]/planes/actions";
import { createOwnFoodAction } from "../app/(panel)/alimentos/actions";
import NewFoodPage from "../app/(panel)/alimentos/nuevo/page";
import { redirect } from "next/navigation";

const sara = { id: "sara", name: "SARA food", group: "FRUTAS", source: "SARA2", active: true, kcalPer100: 100, proteinPer100: 1, carbsPer100: 20, fatPer100: 1 };
const own = { ...sara, id: "own", name: "Historical food", source: "PROPIO" };

function propsWith(root: ReactNode, key: string): Record<string, unknown>[] {
  if (Array.isArray(root)) return root.flatMap((child) => propsWith(child, key));
  if (!isValidElement(root)) return [];
  const props = root.props as Record<string, unknown>;
  return [...(key in props ? [props] : []), ...propsWith(props.children as ReactNode, key)];
}

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listFoods.mockImplementation(async (params) => {
    const foods = [sara, own];
    return params.source ? foods.filter((food) => food.source === params.source) : foods;
  });
  mocks.getPlan.mockResolvedValue({ id: "plan", patientId: "patient", title: "Plan", meals: [] });
  mocks.getTemplate.mockResolvedValue({ id: "template", title: "Template", meals: [] });
  mocks.patient.mockResolvedValue({ id: "patient", name: "Patient", birthDate: null, sex: null });
  mocks.evolution.mockResolvedValue(null);
  mocks.clinical.mockResolvedValue(null);
  mocks.addMeal.mockResolvedValue({ id: "new-meal" });
  mocks.completion.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ meals: [{ name: "Meal", items: [{ ref: 1, quantityGrams: 100 }] }] }) } }] });
});

describe("SARA2-only new food selections", () => {
  it("passes only active SARA2 to the plan picker while retaining historical meals", async () => {
    mocks.getPlan.mockResolvedValue({ id: "plan", patientId: "patient", title: "Plan", meals: [{
      id: "meal", name: "Historical", items: [{ id: "item", foodId: "own", food: { ...own, fiberPer100: null, alcoholPer100: null, nutrients: null, sodiumMgPer100: null }, quantityGrams: 100, customLabel: null, notes: null }],
    }] });
    const page = await PlanPage({ params: Promise.resolve({ id: "patient", planId: "plan" }) });
    expect(mocks.listFoods).toHaveBeenCalledWith({ activeOnly: true, source: "SARA2" });
    const editor = propsWith(page, "ownerField")[0]!;
    expect(editor.foods).toEqual([{ id: "sara", name: "SARA food", group: "FRUTAS", source: "SARA2" }]);
    expect(editor.meals).toMatchObject([{ items: [{ foodId: "own", foodName: "Historical food", macros: { kcal: 100 } }] }]);
  });

  it("passes only active SARA2 to the template picker", async () => {
    mocks.getTemplate.mockResolvedValue({ id: "template", title: "Historical template", meals: [{
      id: "meal", name: "Historical", items: [{ id: "item", foodId: "own", food: { ...own, fiberPer100: null, alcoholPer100: null }, quantityGrams: 100, customLabel: null, notes: null }],
    }] });
    const page = await TemplatePage({ params: Promise.resolve({ id: "template" }) });
    expect(mocks.listFoods).toHaveBeenCalledWith({ activeOnly: true, source: "SARA2" });
    expect(propsWith(page, "ownerField")[0]?.foods).toEqual([{ id: "sara", name: "SARA food", group: "FRUTAS", source: "SARA2" }]);
    expect(propsWith(page, "ownerField")[0]?.meals).toMatchObject([{ items: [{ foodId: "own", foodName: "Historical food" }] }]);
  });

  it("limits the main food catalog to SARA2, including inactive records", async () => {
    const page = await FoodsPage();
    expect(mocks.listFoods).toHaveBeenCalledWith({ activeOnly: false, source: "SARA2" });
    expect(propsWith(page, "foods")[0]?.foods).toMatchObject([{ id: "sara", source: "SARA2" }]);
  });

  it("sends only SARA2 to AI and resolves refs to the corresponding foodId", async () => {
    expect(await generateAiPlanAction({ ok: false }, form({ planId: "plan", patientId: "patient" }))).toEqual({ ok: true });
    expect(mocks.listFoods).toHaveBeenCalledWith({ activeOnly: true, source: "SARA2" });
    const payload = JSON.parse(mocks.completion.mock.calls[0]![0].messages[1].content);
    expect(payload.alimentos).toContain("SARA food");
    expect(payload.alimentos).not.toContain("Historical food");
    expect(mocks.addMealItem).toHaveBeenCalledWith("new-meal", expect.objectContaining({ foodId: "sara" }));
  });

  it("returns an actionable AI error without calling AI when only PROPIO exists", async () => {
    mocks.listFoods.mockImplementation(async (params) => params.source === "SARA2" ? [] : [own]);
    expect(await generateAiPlanAction({ ok: false }, form({ planId: "plan", patientId: "patient" }))).toEqual({
      ok: false, error: "No hay alimentos SARA 2 disponibles. Cargá la base SARA 2 antes de generar un plan.",
    });
    expect(mocks.completion).not.toHaveBeenCalled();
    expect(mocks.addMealItem).not.toHaveBeenCalled();
  });

  it.each([addPlanMealItemAction, addTemplateMealItemAction])("rejects submitted PROPIO ids on the server", async (action) => {
    mocks.getFood.mockResolvedValue(own);
    await expect(action(form({ planId: "plan", templateId: "template", mealId: "meal", foodId: "own", quantityGrams: "100" }))).rejects.toThrow("Solo se pueden agregar alimentos activos de SARA 2.");
    expect(mocks.addMealItem).not.toHaveBeenCalled();
    expect(mocks.addTemplateMealItem).not.toHaveBeenCalled();
  });

  it.each([addPlanMealItemAction, addTemplateMealItemAction])("allows new active SARA2 selections on the server", async (action) => {
    mocks.getFood.mockResolvedValue(sara);
    await action(form({ planId: "plan", templateId: "template", mealId: "meal", foodId: "sara", quantityGrams: "100" }));
    const write = action === addPlanMealItemAction ? mocks.addMealItem : mocks.addTemplateMealItem;
    expect(write).toHaveBeenCalledWith("meal", expect.objectContaining({ foodId: "sara" }));
  });

  it("disables the own-food creation action and redirects its old page", async () => {
    expect(await createOwnFoodAction()).toMatchObject({ ok: false, error: expect.stringContaining("ya no está disponible") });
    NewFoodPage();
    expect(redirect).toHaveBeenCalledWith("/alimentos");
  });

  it("does not copy PROPIO from a historical template into a new plan", async () => {
    mocks.getTemplate.mockResolvedValue({ meals: [{ items: [{ food: own }] }] });
    const result = await applyTemplateAction({ ok: false }, form({ patientId: "patient", templateId: "template" }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("PROPIO históricos");
    expect(mocks.applyTemplateToPatient).not.toHaveBeenCalled();
  });
});
