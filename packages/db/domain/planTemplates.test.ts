// HU-018c-2 (pendiente de la revisión de 018c-1): applyTemplateToPatient copia los ítems de receta
// con su receta, sus porciones y su día (prisma mockeado, patrón de weeklyMenu.test.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ prisma: {} as Record<string, any> }));
vi.mock("../index", () => ({ prisma: mocks.prisma }));

import {
  TemplateNotPublishedError, applyTemplateToPatient, listTemplates, getTemplate, createTemplate,
  updateTemplate, deleteTemplate, addTemplateMeal, deleteTemplateMeal, getTemplateMeal,
  addTemplateMealItem, deleteTemplateMealItem,
} from "./planTemplates";
import { markTemplateReviewed } from "./planTemplateImport";
import { nextItemOrder } from "./weeklyMenu";

const p = () => mocks.prisma;
const dec = (v: number) => ({ toString: () => String(v) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.planTemplate = { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), updateMany: vi.fn() };
  mocks.prisma.templateMeal = { createMany: vi.fn(), create: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() };
  mocks.prisma.templateMealItem = { create: vi.fn(), delete: vi.fn(), findFirst: vi.fn() };
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

describe("direct template ownership", () => {
  const scope = { templateId: "tpl1", tenantId: "tenantA" };
  const root = { id: scope.templateId, tenantId: scope.tenantId };
  const relation = { templateId: scope.templateId, template: { tenantId: scope.tenantId } };

  it("limits list and detail to the owner", async () => {
    p().planTemplate.findMany.mockImplementation(({ where }: { where?: { tenantId?: string } }) =>
      [template, { ...template, id: "tpl2", tenantId: "tenantB" }].filter((t) =>
        !where?.tenantId || where.tenantId === ("tenantId" in t ? t.tenantId : "tenantA")));
    p().planTemplate.findUnique.mockImplementation(({ where }: { where: { id: string; tenantId?: string } }) =>
      where.id === "tpl2" && where.tenantId === "tenantA" ? null : template);
    expect(await listTemplates({ tenantId: "tenantA" })).toEqual([template]);
    expect(await getTemplate("tpl2", "tenantA")).toBeNull();
    expect(await getTemplate("tpl1", "tenantA")).toBe(template);
  });

  it("creates with ownership and defaults, and filters effective root writes", async () => {
    p().planTemplate.create.mockResolvedValue(template);
    await createTemplate({ title: "New" }, "tenantA");
    expect(p().planTemplate.create).toHaveBeenCalledWith({ data: { title: "New", tenantId: "tenantA" } });
    expect(p().templateMeal.createMany).toHaveBeenCalledOnce();
    await updateTemplate("tpl1", { title: "Edit" }, "tenantA");
    await deleteTemplate("tpl1", "tenantA");
    expect(p().planTemplate.update).toHaveBeenCalledWith({ where: root, data: { title: "Edit" } });
    expect(p().planTemplate.delete).toHaveBeenCalledWith({ where: root });
  });

  it.each(["update", "delete"] as const)("rejects a foreign template %s without changing its row", async (operation) => {
    let foreign: { id: string; tenantId: string; title: string } | undefined = {
      id: "tpl2", tenantId: "tenantB", title: "Foreign template",
    };
    const before = { ...foreign };
    const notFound = Object.assign(new Error("Record not found"), { code: "P2025" });
    p().planTemplate[operation].mockImplementation(async ({ where, data }: {
      where: { id: string; tenantId?: string }; data?: { title: string };
    }) => {
      if (!foreign || where.id !== foreign.id || (where.tenantId !== undefined && where.tenantId !== foreign.tenantId)) {
        throw notFound;
      }
      const updated = { ...foreign, ...data };
      foreign = operation === "delete" ? undefined : updated;
      return updated;
    });

    const result = operation === "delete"
      ? deleteTemplate("tpl2", scope.tenantId)
      : updateTemplate("tpl2", { title: "Unauthorized edit" }, scope.tenantId);
    await expect(result).rejects.toMatchObject({ code: "P2025" });
    expect(foreign).toEqual(before);
    expect(p().planTemplate[operation]).toHaveBeenCalledOnce();
    expect(p().planTemplate[operation]).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "tpl2", tenantId: scope.tenantId },
    }));
  });

  it("scopes meal creation, lookup and deletion to the template and tenant", async () => {
    p().templateMeal.count.mockResolvedValue(1);
    await addTemplateMeal("tpl1", { name: "Lunch", order: 2 }, "tenantA");
    expect(p().templateMeal.count).toHaveBeenCalledWith({ where: { ...relation, mode: "PER_DAY" } });
    expect(p().planTemplate.update).toHaveBeenCalledWith(expect.objectContaining({ where: root, data: {
      meals: { create: { name: "Lunch", order: 2, mode: "PER_DAY", isOptions: false } },
    } }));
    await getTemplateMeal("m1", scope);
    expect(p().templateMeal.findUnique).toHaveBeenCalledWith({ where: { id: "m1", ...relation }, select: { id: true } });
    await deleteTemplateMeal("m2", scope);
    expect(p().templateMeal.delete).toHaveBeenCalledWith({ where: { id: "m2", ...relation } });
    expect(p().templateMeal.create).not.toHaveBeenCalled();
  });

  it("rejects a mismatched meal before item creation, and filters both item writes", async () => {
    p().templateMeal.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ mode: "PER_DAY" });
    const item = { order: 1, weekday: "TUE" as const, customLabel: "Food" };
    await expect(addTemplateMealItem("m2", item, scope)).rejects.toThrow("La comida no existe.");
    expect(p().templateMeal.update).not.toHaveBeenCalled();
    expect(p().templateMealItem.create).not.toHaveBeenCalled();
    await addTemplateMealItem("m1", item, scope);
    expect(p().templateMeal.findUnique).toHaveBeenLastCalledWith({ where: { id: "m1", ...relation }, select: { mode: true } });
    expect(p().templateMeal.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "m1", ...relation }, data: { items: { create: item } } }));
    await deleteTemplateMealItem("i2", scope);
    expect(p().templateMealItem.delete).toHaveBeenCalledWith({ where: { id: "i2", meal: relation } });
  });

  it("scopes item order by meal, day, template and tenant", async () => {
    p().templateMealItem.findFirst.mockResolvedValue({ order: 4 });
    expect(await nextItemOrder("template", "m1", "TUE", scope)).toBe(5);
    expect(p().templateMealItem.findFirst).toHaveBeenCalledWith({
      where: { mealId: "m1", weekday: "TUE", meal: relation }, orderBy: { order: "desc" }, select: { order: true },
    });
  });

  it("limits review stamping to the first review of an imported draft in the current tenant", async () => {
    await markTemplateReviewed("tpl1", "tenantA");
    expect(p().planTemplate.updateMany).toHaveBeenCalledWith({
      where: { ...root, status: "DRAFT", origin: "IMPORT", reviewedAt: null },
      data: { reviewedAt: expect.any(Date) },
    });
  });
});

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
describe("tenant-scoped template application", () => {
  const tenantId = "tenantA";
  const plan = { id: "plan1", tenantId };

  beforeEach(() => {
    p().patient = { findUnique: vi.fn(({ where }) => where.id === "pat2" && where.tenantId === tenantId ? null : { id: where.id }) };
    p().recipe = { count: vi.fn(({ where }) => where.tenantId === tenantId && !where.id.in.includes("foreignRecipe") ? where.id.in.length : 0) };
    p().planTemplate.findUnique.mockImplementation(({ where }: { where: { id: string; tenantId?: string } }) =>
      where.id === "tpl2" && where.tenantId === tenantId ? null : template);
    p().nutritionPlan.create.mockResolvedValue(plan);
    p().nutritionPlan.findUnique.mockResolvedValue(plan);
  });

  it.each([["tpl2", "pat1"], ["tpl1", "pat2"]])("rejects a foreign source or destination (%s, %s) without a write", async (source, destination) => {
    await expect(applyTemplateToPatient(source!, destination!, tenantId)).rejects.toThrow();
    expect(p().nutritionPlan.create).not.toHaveBeenCalled();
    expect(p().nutritionPlan.findUnique).not.toHaveBeenCalled();
  });

  it.each(["foreignRecipe", "historicalFood"])("rejects an unsafe %s reference before writing", async (reference) => {
    p().planTemplate.findUnique.mockResolvedValue({ ...template, meals: [{ ...template.meals[0], items: [reference === "foreignRecipe"
      ? { ...template.meals[0]!.items[0], recipeId: reference }
      : { ...template.meals[0]!.items[1], food: { source: "PROPIO" } }] }] });
    await expect(applyTemplateToPatient("tpl1", "pat1", tenantId)).rejects.toThrow();
    expect(p().nutritionPlan.create).not.toHaveBeenCalled();
    expect(p().nutritionPlan.findUnique).not.toHaveBeenCalled();
  });

  it("copies valid content into a plan owned by the destination tenant", async () => {
    const sections = [{ title: "Texto", body: "Contenido", order: 3 }];
    p().planTemplate.findUnique.mockResolvedValue({ ...template, sections });
    expect(await applyTemplateToPatient("tpl1", "pat1", tenantId)).toEqual(plan);
    expect(p().patient.findUnique).toHaveBeenCalledWith({ where: { id: "pat1", tenantId }, select: { id: true } });
    expect(p().planTemplate.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "tpl1", tenantId } }));
    expect(p().recipe.count).toHaveBeenCalledWith({ where: { id: { in: ["r1"] }, tenantId } });
    expect(p().nutritionPlan.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      patientId: "pat1", tenantId, title: "Plantilla", notes: null, status: "DRAFT", sections: { create: sections },
      meals: { create: [expect.objectContaining({ mode: "PER_DAY", isOptions: false, items: { create: [
        expect.objectContaining({ recipeId: "r1", portions: expect.any(Object), weekday: "THU" }),
        expect.objectContaining({ foodId: "f1", notes: "sin azúcar" }),
        expect.objectContaining({ foodId: "f2", measureName: "cda", measurePlural: "cdas" }),
      ] } })] },
    }), select: { id: true } });
    expect(p().nutritionPlan.findUnique).not.toHaveBeenCalled();
  });
});

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
