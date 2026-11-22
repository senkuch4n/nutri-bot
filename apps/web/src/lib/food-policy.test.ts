import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  access: vi.fn(), listTemplates: vi.fn().mockResolvedValue([]),
  TemplateContainsHistoricalFoodError: class TemplateContainsHistoricalFoodError extends Error {},
  TemplateApplicationUnavailableError: class TemplateApplicationUnavailableError extends Error {},
  listPatientPlans: vi.fn().mockResolvedValue([]), listDiaryEntries: vi.fn().mockResolvedValue([]),
  listPatientConsultations: vi.fn().mockResolvedValue([]), listLatestPrescriptions: vi.fn().mockResolvedValue([]),
  listFoods: vi.fn(), getPlan: vi.fn(), getTemplate: vi.fn(), getTemplateMeal: vi.fn().mockResolvedValue({ id: "meal" }), getFood: vi.fn(),
  addMeal: vi.fn(), addMealItem: vi.fn(), addTemplateMealItem: vi.fn(),
  applyTemplateToPatient: vi.fn(), completion: vi.fn(),
  // HU-018b: el orden del ítem sale de nextItemOrder y la IA reemplaza las comidas vacías.
  nextItemOrder: vi.fn().mockResolvedValue(0), deleteMeal: vi.fn(),
  // HU-018b-2: la página del plan carga el objetivo (D7) y la consulta del aviso (D11).
  getPlanTarget: vi.fn().mockResolvedValue(null), getPlanConsultationId: vi.fn().mockResolvedValue(null),
  patient: vi.fn(), evolution: vi.fn(), clinical: vi.fn(),
  // HU-018d: las páginas cargan las medidas de los SARA 2 y las actions resuelven la medida elegida.
  listMeasuresForPicker: vi.fn().mockResolvedValue({}), resolveMeasureItem: vi.fn(),
  // 018d-1b (R4): la action traduce este error a un mensaje amable.
  FoodMeasureNotFoundError: class FoodMeasureNotFoundError extends Error {},
  // HU-020: touchTemplate marca el borrador importado como revisado; un borrador no se aplica.
  markTemplateReviewed: vi.fn(),
  TemplateNotPublishedError: class TemplateNotPublishedError extends Error {},
}));

vi.mock("@nutri-bot/db/domain", () => ({
  ...mocks,
  getTenantProfessional: vi.fn().mockResolvedValue({ timezone: "UTC" }),
  getLatestFormulaMeasurements: vi.fn().mockResolvedValue({ weightKg: null, heightCm: null, bodyFatPercent: null }),
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
// HU-018d: el editor monta el cuadro de medida casera; sus actions no se usan en este test.
vi.mock("@/app/(panel)/food-measure-actions", () => ({}));
// HU-020: las páginas montan "Textos del plan" y la revisión del borrador; sus actions no se usan acá.
vi.mock("@/app/(panel)/plan-section-actions", () => ({}));
vi.mock("@/app/(panel)/plantillas/import-actions", () => ({}));
vi.mock("server-only", () => ({})); // lib/revalidate-menu-owner (HU-018c)
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/private-content-access", () => ({ resolvePrivateContentAccess: mocks.access }));
// HU-025b-1: las páginas y acciones toman el consultorio del contexto de la sesión.
const TENANT_CTX = vi.hoisted(() => ({
  userId: "u", tenantId: "legacy-tenant", agendaId: "legacy-agenda", professionalId: 1,
  access: { kind: "member" as const, tenantId: "legacy-tenant", role: "OWNER" as const },
}));
vi.mock("@/lib/tenant-context", () => ({
  requirePageContext: async () => TENANT_CTX,
  requireTenantContext: async () => TENANT_CTX,
  getTenantContext: async () => TENANT_CTX,
  TenantAccessError: class TenantAccessError extends Error {},
}));
vi.mock("@/lib/professional", () => ({ getProfessional: vi.fn().mockResolvedValue({ timezone: "UTC" }) }));
vi.mock("@/lib/deepseek", () => ({ DEEPSEEK_MODEL: "test", deepseekClient: () => ({ chat: { completions: { create: mocks.completion } } }) }));
vi.mock("@/lib/plan-pdf", () => ({ renderPlanPdf: vi.fn() }));

vi.mock("@/lib/services", () => ({ listServices: vi.fn().mockResolvedValue([]) }));

import { PatientRecord } from "../app/(panel)/pacientes/[id]/patient-record";
import PlanPage from "../app/(panel)/pacientes/[id]/planes/[planId]/page";
import { PlanDetail } from "../app/(panel)/pacientes/[id]/planes/[planId]/plan-detail";
import TemplatePage from "../app/(panel)/plantillas/[id]/page";
import TemplatesPage from "../app/(panel)/plantillas/page";
import FoodsPage from "../app/(panel)/alimentos/page";
import { generateAiPlanAction } from "../app/(panel)/pacientes/[id]/planes/[planId]/ai-actions";
import { addPlanMealItemAction } from "../app/(panel)/pacientes/[id]/planes/[planId]/actions";
import { addTemplateMealItemAction } from "../app/(panel)/plantillas/actions";
import { applyTemplateAction } from "../app/(panel)/pacientes/[id]/planes/actions";
import { createOwnFoodAction } from "../app/(panel)/alimentos/actions";
import NewFoodPage from "../app/(panel)/alimentos/nuevo/page";
import { notFound, redirect } from "next/navigation";

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
  mocks.access.mockResolvedValue({ tenantId: "tenant", role: "OWNER" });
  mocks.listFoods.mockImplementation(async (params) => {
    const foods = [sara, own];
    return params.source ? foods.filter((food) => food.source === params.source) : foods;
  });
  mocks.getPlan.mockResolvedValue({ id: "plan", patientId: "patient", title: "Plan", meals: [], sections: [] });
  mocks.getTemplate.mockResolvedValue({ id: "template", title: "Template", status: "PUBLISHED", meals: [], sections: [] });
  mocks.patient.mockResolvedValue({ id: "patient", name: "Patient", birthDate: null, sex: null });
  mocks.evolution.mockResolvedValue(null);
  mocks.clinical.mockResolvedValue(null);
  mocks.addMeal.mockResolvedValue({ id: "new-meal" });
  mocks.completion.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ meals: [{ name: "Meal", items: [{ ref: 1, quantityGrams: 100 }] }] }) } }] });
});

describe("patient record template picker", () => {
  beforeEach(() => {
    mocks.patient.mockResolvedValue({ id: "patient", tenantId: "tenant", name: "Patient", birthDate: null, sex: null,
      archivedAt: null, createdAt: new Date(0), phone: "5491100000000", whatsappJid: "5491100000000@s.whatsapp.net",
      appointments: [], clinicalRecord: null, evolutionEntries: [] });
    mocks.listTemplates.mockResolvedValue([{ id: "template", title: "Template" }]);
  });

  async function planPanel() {
    const record = await PatientRecord({ id: "patient", variant: "page" });
    const tabProps = propsWith(record, "panels")[0];
    const plans = (tabProps?.panels as { planes?: ReactNode } | undefined)?.planes;
    return isValidElement(plans) ? plans.props : undefined;
  }

  it("lists published templates for the patient's trusted tenant", async () => {
    expect(await planPanel()).toMatchObject({ patientId: "patient", templates: [{ id: "template", title: "Template" }] });
    expect(mocks.listTemplates).toHaveBeenCalledWith({ status: "PUBLISHED", tenantId: "tenant" });
  });

  it.each([null, { tenantId: "other", role: "OWNER" }])("preserves unrelated patient views but hides the picker for membership %j", async (access) => {
    mocks.access.mockResolvedValue(access);
    expect(await planPanel()).toMatchObject({ patientId: "patient", plans: [], templates: null });
    expect(mocks.listTemplates).not.toHaveBeenCalled();
    expect(mocks.listPatientPlans).toHaveBeenCalledWith("patient");
    expect(mocks.listPatientConsultations).toHaveBeenCalledWith(TENANT_CTX, "patient");
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("private template pages", () => {
  it("lists only the authorized tenant's templates", async () => {
    await TemplatesPage();
    expect(mocks.listTemplates).toHaveBeenCalledWith({ tenantId: "tenant" });
  });

  it("does not query templates without membership", async () => {
    mocks.access.mockResolvedValue(null);
    vi.mocked(notFound).mockImplementationOnce(() => { throw new Error("404"); });
    await expect(TemplatesPage()).rejects.toThrow("404");
    vi.mocked(notFound).mockImplementationOnce(() => { throw new Error("404"); });
    await expect(TemplatePage({ params: Promise.resolve({ id: "other" }) })).rejects.toThrow("404");
    expect(mocks.listTemplates).not.toHaveBeenCalled();
    expect(mocks.getTemplate).not.toHaveBeenCalled();
  });

  it("does not render an unknown or foreign detail or load its editor", async () => {
    mocks.getTemplate.mockResolvedValueOnce(null);
    vi.mocked(notFound).mockImplementationOnce(() => { throw new Error("404"); });
    await expect(TemplatePage({ params: Promise.resolve({ id: "other" }) })).rejects.toThrow("404");
    expect(mocks.getTemplate).toHaveBeenCalledWith("other", "tenant");
    expect(mocks.listFoods).not.toHaveBeenCalled();
    expect(mocks.listMeasuresForPicker).not.toHaveBeenCalled();
  });
});

describe("SARA2-only new food selections", () => {
  it("passes only active SARA2 to the plan picker while retaining historical meals", async () => {
    mocks.getPlan.mockResolvedValue({ id: "plan", patientId: "patient", title: "Plan", sections: [], meals: [{
      id: "meal", name: "Historical", items: [{ id: "item", foodId: "own", food: { ...own, fiberPer100: null, alcoholPer100: null, nutrients: null, sodiumMgPer100: null }, quantityGrams: 100, customLabel: null, notes: null }],
    }] });
    // La página delega en PlanDetail (compartido con el modal de la ficha).
    const pageEl = await PlanPage({ params: Promise.resolve({ id: "patient", planId: "plan" }) });
    expect(isValidElement(pageEl) && pageEl.type).toBe(PlanDetail);
    expect(isValidElement(pageEl) && pageEl.props).toMatchObject({ id: "patient", planId: "plan", variant: "page" });
    const page = await PlanDetail({ id: "patient", planId: "plan", dia: undefined, variant: "page" });
    expect(mocks.listFoods).toHaveBeenCalledWith({ activeOnly: true, source: "SARA2" });
    const editor = propsWith(page, "ownerField")[0]!;
    expect(editor.foods).toEqual([{ id: "sara", name: "SARA food", group: "FRUTAS", source: "SARA2", kcalPer100: 100 }]);
    expect(editor.meals).toMatchObject([{ items: [{ foodId: "own", foodName: "Historical food", macros: { kcal: 100 } }] }]);
    // HU-018d: las medidas de los SARA 2 llegan al editor.
    expect(mocks.listMeasuresForPicker).toHaveBeenCalled();
    expect(editor.measures).toEqual({});
  });

  it("passes only active SARA2 to the template picker", async () => {
    mocks.getTemplate.mockResolvedValue({ id: "template", title: "Historical template", sections: [], meals: [{
      id: "meal", name: "Historical", items: [{ id: "item", foodId: "own", food: { ...own, fiberPer100: null, alcoholPer100: null }, quantityGrams: 100, customLabel: null, notes: null }],
    }] });
    const page = await TemplatePage({ params: Promise.resolve({ id: "template" }) });
    expect(mocks.getTemplate).toHaveBeenCalledWith("template", "tenant");
    expect(mocks.listFoods).toHaveBeenCalledWith({ activeOnly: true, source: "SARA2" });
    expect(propsWith(page, "ownerField")[0]?.foods).toEqual([{ id: "sara", name: "SARA food", group: "FRUTAS", source: "SARA2", kcalPer100: 100 }]);
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
    const scope = action === addPlanMealItemAction ? [] : [{ templateId: "template", tenantId: "tenant" }];
    expect(write).toHaveBeenCalledWith("meal", expect.objectContaining({ foodId: "sara" }), ...scope);
  });

  it("disables the own-food creation action and redirects its old page", async () => {
    expect(await createOwnFoodAction()).toMatchObject({ ok: false, error: expect.stringContaining("ya no está disponible") });
    NewFoodPage();
    expect(redirect).toHaveBeenCalledWith("/alimentos");
  });

  it("does not copy PROPIO from a historical template into a new plan", async () => {
    const message = "Esta plantilla contiene alimentos PROPIO históricos. Para crear un plan nuevo, usá una plantilla con alimentos SARA 2.";
    mocks.applyTemplateToPatient.mockRejectedValueOnce(new mocks.TemplateContainsHistoricalFoodError(message));
    expect(await applyTemplateAction({ ok: false }, form({ patientId: "patient", templateId: "template" }))).toEqual({
      ok: false, error: message,
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([addPlanMealItemAction, addTemplateMealItemAction])("HU-018d: alta en medida casera usa los gramos de la medida e ignora quantityGrams", async (action) => {
    mocks.getFood.mockResolvedValue(sara);
    mocks.resolveMeasureItem.mockResolvedValue({ measureQty: 1.5, measureName: "taza", measurePlural: "tazas", measureGrams: 180, quantityGrams: 270 });
    await action(form({
      planId: "plan", templateId: "template", mealId: "meal", foodId: "sara", quantityGrams: "999",
      customLabel: "ignorada", measureId: "m1", measureQty: "1,5", weekday: "TUE",
    }));
    expect(mocks.resolveMeasureItem).toHaveBeenCalledWith("sara", "m1", 1.5);
    const write = action === addPlanMealItemAction ? mocks.addMealItem : mocks.addTemplateMealItem;
    const scope = action === addPlanMealItemAction ? [] : [{ templateId: "template", tenantId: "tenant" }];
    expect(write).toHaveBeenCalledWith("meal", {
      foodId: "sara", customLabel: null, notes: null, order: 0, weekday: "TUE",
      measureQty: 1.5, measureName: "taza", measurePlural: "tazas", measureGrams: 180, quantityGrams: 270,
    }, ...scope);
  });

  it.each([addPlanMealItemAction, addTemplateMealItemAction])("HU-018d: cantidad inválida no escribe y un PROPIO con medida sigue rechazado", async (action) => {
    mocks.getFood.mockResolvedValue(sara);
    await action(form({ planId: "plan", templateId: "template", mealId: "meal", foodId: "sara", measureId: "m1", measureQty: "1,3" }));
    mocks.getFood.mockResolvedValue(own);
    await expect(action(form({ planId: "plan", templateId: "template", mealId: "meal", foodId: "own", measureId: "m1", measureQty: "1" })))
      .rejects.toThrow("Solo se pueden agregar alimentos activos de SARA 2.");
    expect(mocks.resolveMeasureItem).not.toHaveBeenCalled();
    expect(mocks.addMealItem).not.toHaveBeenCalled();
    expect(mocks.addTemplateMealItem).not.toHaveBeenCalled();
  });

  it.each([addPlanMealItemAction, addTemplateMealItemAction])("018d-1b (R4): medida borrada con el editor abierto → error amable, sin escribir", async (action) => {
    mocks.getFood.mockResolvedValue(sara);
    mocks.resolveMeasureItem.mockRejectedValueOnce(new mocks.FoodMeasureNotFoundError());
    const values = { planId: "plan", templateId: "template", mealId: "meal", foodId: "sara", measureId: "m1", measureQty: "1" };
    expect(await action(form(values))).toEqual({ ok: false, error: "Esa medida ya no existe. Elegí otra." });
    mocks.resolveMeasureItem.mockRejectedValueOnce(new RangeError("qty"));
    expect(await action(form(values))).toEqual({ ok: false, error: "Esa medida ya no existe. Elegí otra." });
    mocks.resolveMeasureItem.mockRejectedValueOnce(new Error("boom"));
    await expect(action(form(values))).rejects.toThrow("boom");
    expect(mocks.addMealItem).not.toHaveBeenCalled();
    expect(mocks.addTemplateMealItem).not.toHaveBeenCalled();
  });
});
