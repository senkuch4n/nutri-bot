// HU-018c-2 (pendiente de la revisión de 018c-1): applyTemplateToPatient copia los ítems de receta
// con su receta, sus porciones y su día (prisma mockeado, patrón de weeklyMenu.test.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ prisma: {} as Record<string, any> }));
vi.mock("../index", () => ({ prisma: mocks.prisma }));

import { TemplateNotPublishedError, applyTemplateToPatient, listTemplates } from "./planTemplates";

const p = () => mocks.prisma;
const dec = (v: number) => ({ toString: () => String(v) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.planTemplate = { findUnique: vi.fn(), findMany: vi.fn() };
  mocks.prisma.nutritionPlan = { create: vi.fn(), findUnique: vi.fn() };
  mocks.prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
});

const template = {
  id: "tpl1",
  title: "Plantilla",
  notes: null,
  status: "PUBLISHED",
  sections: [] as { title: string; body: string; order: number }[],
  meals: [
    {
      id: "m1",
      name: "Desayuno",
      order: 0,
      mode: "PER_DAY",
      isOptions: false,
      items: [
        { foodId: null, customLabel: null, quantityGrams: null, notes: null, order: 0, weekday: "THU", recipeId: "r1", portions: dec(2) },
        { foodId: "f1", customLabel: null, quantityGrams: dec(250), notes: "sin azúcar", order: 1, weekday: "THU", recipeId: null, portions: null, measureQty: null, measureName: null, measurePlural: null, measureGrams: null },
        { foodId: "f2", customLabel: null, quantityGrams: dec(10), notes: null, order: 2, weekday: "THU", recipeId: null, portions: null, measureQty: dec(1), measureName: "cda", measurePlural: "cdas", measureGrams: dec(10) },
      ],
    },
  ],
};

describe("applyTemplateToPatient", () => {
  it("copia el ítem de receta con recipeId, portions y weekday, y el de alimento sin porciones", async () => {
    p().planTemplate.findUnique.mockResolvedValue(template);
    p().nutritionPlan.create.mockResolvedValue({ id: "plan1" });
    p().nutritionPlan.findUnique.mockResolvedValue({ id: "plan1" });

    await applyTemplateToPatient("tpl1", "pat1");

    expect(p().nutritionPlan.create).toHaveBeenCalledTimes(1);
    const data = p().nutritionPlan.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ patientId: "pat1", title: "Plantilla", status: "DRAFT" });
    const meal = data.meals.create[0];
    expect(meal).toMatchObject({ name: "Desayuno", mode: "PER_DAY", isOptions: false, order: 0 });
    const [recipeItem, foodItem] = meal.items.create;
    expect(recipeItem).toMatchObject({ recipeId: "r1", weekday: "THU", foodId: null, quantityGrams: null, customLabel: null, order: 0 });
    expect(Number(recipeItem.portions.toString())).toBe(2);
    expect(foodItem).toMatchObject({ foodId: "f1", recipeId: null, portions: null, weekday: "THU", notes: "sin azúcar" });
    expect(foodItem).toMatchObject({ measureQty: null, measureName: null, measurePlural: null, measureGrams: null });
  });

  it("HU-018d: copia la medida casera del ítem (cantidad, nombre, plural y gramos por medida)", async () => {
    p().planTemplate.findUnique.mockResolvedValue(template);
    p().nutritionPlan.create.mockResolvedValue({ id: "plan1" });
    p().nutritionPlan.findUnique.mockResolvedValue({ id: "plan1" });

    await applyTemplateToPatient("tpl1", "pat1");

    const measureItem = p().nutritionPlan.create.mock.calls[0][0].data.meals.create[0].items.create[2];
    expect(measureItem).toMatchObject({ foodId: "f2", measureName: "cda", measurePlural: "cdas", order: 2, weekday: "THU" });
    expect(Number(measureItem.measureQty.toString())).toBe(1);
    expect(Number(measureItem.measureGrams.toString())).toBe(10);
    expect(Number(measureItem.quantityGrams.toString())).toBe(10);
  });

  it("si la plantilla no existe, no crea nada", async () => {
    p().planTemplate.findUnique.mockResolvedValue(null);
    await expect(applyTemplateToPatient("nope", "pat1")).rejects.toThrow(/Plantilla no encontrada/);
    expect(p().nutritionPlan.create).not.toHaveBeenCalled();
  });
});

// HU-020: listar por estado, rechazar borradores y copiar los textos del plan.
describe("HU-020 listTemplates", () => {
  const select = { id: true, title: true, notes: true, status: true, origin: true, reviewedAt: true };

  it("sin filtro: borradores primero y los 6 campos", async () => {
    p().planTemplate.findMany.mockResolvedValue([]);
    await listTemplates();
    const args = p().planTemplate.findMany.mock.calls[0][0];
    expect(args.where).toBeUndefined();
    expect(args.orderBy).toEqual([{ status: "asc" }, { title: "asc" }]);
    expect(args.select).toEqual(select);
  });

  it("con status: filtra", async () => {
    p().planTemplate.findMany.mockResolvedValue([]);
    await listTemplates({ status: "PUBLISHED" });
    expect(p().planTemplate.findMany.mock.calls[0][0].where).toEqual({ status: "PUBLISHED" });
  });
});

describe("HU-020 applyTemplateToPatient", () => {
  it("un borrador → TemplateNotPublishedError, sin crear el plan", async () => {
    p().planTemplate.findUnique.mockResolvedValue({ ...template, status: "DRAFT" });
    await expect(applyTemplateToPatient("tpl1", "pat1")).rejects.toBeInstanceOf(TemplateNotPublishedError);
    expect(p().nutritionPlan.create).not.toHaveBeenCalled();
  });

  it("copia las secciones en el orden de la plantilla", async () => {
    p().planTemplate.findUnique.mockResolvedValue({
      ...template,
      sections: [
        { id: "s1", title: "Recomendaciones", body: "a\nb", order: 0 },
        { id: "s2", title: "Reemplazos", body: "c", order: 1 },
      ],
    });
    p().nutritionPlan.create.mockResolvedValue({ id: "plan1" });
    p().nutritionPlan.findUnique.mockResolvedValue({ id: "plan1" });
    await applyTemplateToPatient("tpl1", "pat1");
    expect(p().nutritionPlan.create.mock.calls[0][0].data.sections).toEqual({
      create: [
        { title: "Recomendaciones", body: "a\nb", order: 0 },
        { title: "Reemplazos", body: "c", order: 1 },
      ],
    });
  });

  it("sin secciones → create: []", async () => {
    p().planTemplate.findUnique.mockResolvedValue(template);
    p().nutritionPlan.create.mockResolvedValue({ id: "plan1" });
    p().nutritionPlan.findUnique.mockResolvedValue({ id: "plan1" });
    await applyTemplateToPatient("tpl1", "pat1");
    expect(p().nutritionPlan.create.mock.calls[0][0].data.sections).toEqual({ create: [] });
  });
});
