// HU-020: plantillas importadas de PDF (prisma mockeado; $transaction pasa el mismo objeto como tx).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanImportDraft } from "@nutri-bot/core/plan-import";

const mocks = vi.hoisted(() => ({ prisma: {} as Record<string, any> }));
vi.mock("../index", () => ({ prisma: mocks.prisma, Prisma: { DbNull: "DbNull" } }));

import {
  TemplateHintNotFoundError,
  TemplateNotPublishableError,
  deleteUnreviewedTemplateDrafts,
  dismissTemplateHint,
  linkHintRecipe,
  markTemplateReviewed,
  publishTemplate,
  resolveUnplacedHint,
  upsertImportedTemplate,
} from "./planTemplateImport";
import { MealWeekdayMismatchError, RecipeNotAvailableError } from "./weeklyMenu";

const p = () => mocks.prisma;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.planTemplate = {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn(),
  };
  mocks.prisma.templateMeal = { deleteMany: vi.fn(), findFirst: vi.fn() };
  mocks.prisma.planTemplateSection = {
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn().mockResolvedValue({ _max: { order: null } }),
    create: vi.fn().mockResolvedValue({ id: "sNew" }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  mocks.prisma.templateMealItem = { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() };
  mocks.prisma.recipe = { findUnique: vi.fn(), findMany: vi.fn() };
  mocks.prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
});

const draft: PlanImportDraft = {
  importKey: `pdf-sha256:${"b".repeat(64)}`,
  title: "Para comer mejor",
  meals: [
    {
      key: "BREAKFAST:1",
      name: "Desayuno",
      mode: "PER_DAY",
      isOptions: false,
      items: [
        { kind: "TEXT", ref: "i1", weekday: "MON", label: "Té + pan", notes: "Hidratos" },
        { kind: "TEXT", ref: "i2", weekday: "TUE", label: "Mate", notes: null },
      ],
    },
    {
      key: "OPTIONS",
      name: "Colaciones",
      mode: "EVERY_DAY",
      isOptions: true,
      items: [
        { kind: "RECIPE", ref: "i3", weekday: null, recipeId: "r1", portions: 1 },
        { kind: "TEXT", ref: "i4", weekday: null, label: "Tarta (2 unidades)", notes: null },
      ],
    },
  ],
  sections: [{ title: "Recomendaciones", body: "a\nb" }],
  hints: [
    { id: "h1", kind: "RECIPE_SUGGESTION", label: "Tarta (2 unidades)", recipeId: "r2", recipeName: "Tarta", itemRef: "i4" },
    { id: "h2", kind: "UNPLACED", text: "x", page: 3 },
  ],
  stats: { pages: 1, meals: 2, textItems: 3, recipeItems: 1, recipeSuggestions: 1, sections: 1, unplaced: 1, redactions: 0, coverLinesDropped: 0, footerSegments: 0 },
};

const createdMeals = {
  id: "tNew",
  meals: [
    { order: 0, items: [{ id: "it1", weekday: "MON", order: 0 }, { id: "it2", weekday: "TUE", order: 0 }] },
    { order: 1, items: [{ id: "it3", weekday: null, order: 0 }, { id: "it4", weekday: null, order: 1 }] },
  ],
};

describe("upsertImportedTemplate", () => {
  it("no existe → crea DRAFT + IMPORT con comidas, ítems sin alimento, secciones y avisos con itemId", async () => {
    p().planTemplate.findUnique.mockResolvedValue(null);
    p().planTemplate.create.mockResolvedValue(createdMeals);
    const r = await upsertImportedTemplate(draft);
    expect(r).toEqual({ id: "tNew", outcome: "created" });
    const data = p().planTemplate.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "DRAFT", origin: "IMPORT", importKey: draft.importKey, title: "Para comer mejor" });
    expect(data.meals.create.map((m: any) => [m.name, m.mode, m.isOptions, m.order])).toEqual([
      ["Desayuno", "PER_DAY", false, 0],
      ["Colaciones", "EVERY_DAY", true, 1],
    ]);
    expect(data.meals.create[0].items.create[0]).toMatchObject({
      customLabel: "Té + pan",
      notes: "Hidratos",
      weekday: "MON",
      order: 0,
      foodId: null,
      quantityGrams: null,
      measureQty: null,
      recipeId: null,
    });
    expect(data.meals.create[1].items.create[0]).toMatchObject({ recipeId: "r1", portions: 1, weekday: null, order: 0, customLabel: null, foodId: null });
    expect(data.meals.create[1].items.create[1]).toMatchObject({ customLabel: "Tarta (2 unidades)", order: 1 });
    expect(data.sections).toEqual({ create: [{ title: "Recomendaciones", body: "a\nb", order: 0 }] });
    const hints = p().planTemplate.update.mock.calls[0][0].data.importHints;
    expect(hints[0]).toMatchObject({ kind: "RECIPE_SUGGESTION", itemRef: "i4", itemId: "it4" });
    expect(hints[1]).toEqual(draft.hints[1]);
  });

  it("PUBLISHED → skipped-published sin escrituras", async () => {
    p().planTemplate.findUnique.mockResolvedValue({ id: "t1", status: "PUBLISHED", reviewedAt: null });
    expect(await upsertImportedTemplate(draft)).toEqual({ id: "t1", outcome: "skipped-published" });
    expect(p().planTemplate.create).not.toHaveBeenCalled();
    expect(p().planTemplate.updateMany).not.toHaveBeenCalled();
    expect(p().templateMeal.deleteMany).not.toHaveBeenCalled();
  });

  it("DRAFT revisado → skipped-reviewed sin escrituras", async () => {
    p().planTemplate.findUnique.mockResolvedValue({ id: "t1", status: "DRAFT", reviewedAt: new Date() });
    expect(await upsertImportedTemplate(draft)).toEqual({ id: "t1", outcome: "skipped-reviewed" });
    expect(p().planTemplate.updateMany).not.toHaveBeenCalled();
    expect(p().templateMeal.deleteMany).not.toHaveBeenCalled();
  });

  it("DRAFT sin revisar → updateMany con guarda, borra solo lo de esa plantilla y recrea", async () => {
    p().planTemplate.findUnique.mockResolvedValue({ id: "t1", status: "DRAFT", reviewedAt: null });
    p().planTemplate.update.mockResolvedValue({ ...createdMeals, id: "t1" });
    expect(await upsertImportedTemplate(draft)).toEqual({ id: "t1", outcome: "updated" });
    expect(p().planTemplate.updateMany.mock.calls[0][0].where).toEqual({ id: "t1", status: "DRAFT", reviewedAt: null });
    expect(p().templateMeal.deleteMany).toHaveBeenCalledWith({ where: { templateId: "t1" } });
    expect(p().planTemplateSection.deleteMany).toHaveBeenCalledWith({ where: { templateId: "t1" } });
    expect(p().planTemplate.update.mock.calls[0][0].data.meals.create).toHaveLength(2);
  });

  it("si la guarda no actualiza (la revisaron recién) → skipped-reviewed sin borrar", async () => {
    p().planTemplate.findUnique.mockResolvedValue({ id: "t1", status: "DRAFT", reviewedAt: null });
    p().planTemplate.updateMany.mockResolvedValue({ count: 0 });
    expect(await upsertImportedTemplate(draft)).toEqual({ id: "t1", outcome: "skipped-reviewed" });
    expect(p().templateMeal.deleteMany).not.toHaveBeenCalled();
    expect(p().planTemplateSection.deleteMany).not.toHaveBeenCalled();
  });
});

describe("deleteUnreviewedTemplateDrafts / markTemplateReviewed", () => {
  it("borra solo los ids dados que siguen sin revisar", async () => {
    p().planTemplate.deleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteUnreviewedTemplateDrafts(["a", "a", ""])).toBe(1);
    expect(p().planTemplate.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["a"] }, status: "DRAFT", origin: "IMPORT", reviewedAt: null },
    });
  });
  it("[] → 0 sin llamar", async () => {
    expect(await deleteUnreviewedTemplateDrafts([])).toBe(0);
    expect(p().planTemplate.deleteMany).not.toHaveBeenCalled();
  });
  it("markTemplateReviewed usa el where de T10", async () => {
    await markTemplateReviewed("t1");
    const args = p().planTemplate.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: "t1", status: "DRAFT", origin: "IMPORT", reviewedAt: null });
    expect(args.data.reviewedAt).toBeInstanceOf(Date);
  });
});

const unplaced = (id: string) => ({ id, kind: "UNPLACED", text: `texto ${id}`, page: 2 });

describe("publishTemplate", () => {
  it("con 2 UNPLACED → TemplateNotPublishableError(2) sin update", async () => {
    p().planTemplate.findUnique.mockResolvedValue({ status: "DRAFT", importHints: [unplaced("h1"), unplaced("h2")], reviewedAt: null });
    const err = await publishTemplate("t1").catch((e) => e);
    expect(err).toBeInstanceOf(TemplateNotPublishableError);
    expect(err.unplaced).toBe(2);
    expect(p().planTemplate.update).not.toHaveBeenCalled();
  });
  it("sin UNPLACED → PUBLISHED, avisos vacíos y reviewedAt puesto", async () => {
    p().planTemplate.findUnique.mockResolvedValue({ status: "DRAFT", importHints: [{ id: "h1", kind: "BREAKFAST_SNACK_SAME_CONTENT" }], reviewedAt: null });
    await publishTemplate("t1");
    const data = p().planTemplate.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "PUBLISHED", importHints: "DbNull" });
    expect(data.reviewedAt).toBeInstanceOf(Date);
  });
});

describe("dismissTemplateHint", () => {
  it("saca solo ese id y marca revisada", async () => {
    p().planTemplate.findUnique.mockResolvedValue({ status: "DRAFT", importHints: [unplaced("h1"), unplaced("h2")] });
    await dismissTemplateHint("t1", "h1");
    expect(p().planTemplate.update.mock.calls[0][0].data.importHints).toEqual([unplaced("h2")]);
    expect(p().planTemplate.updateMany.mock.calls[0][0].where).toMatchObject({ id: "t1", reviewedAt: null });
  });
  it("id inexistente o plantilla publicada → TemplateHintNotFoundError", async () => {
    p().planTemplate.findUnique.mockResolvedValue({ status: "DRAFT", importHints: [unplaced("h1")] });
    await expect(dismissTemplateHint("t1", "nope")).rejects.toBeInstanceOf(TemplateHintNotFoundError);
    p().planTemplate.findUnique.mockResolvedValue({ status: "PUBLISHED", importHints: [unplaced("h1")] });
    await expect(dismissTemplateHint("t1", "h1")).rejects.toBeInstanceOf(TemplateHintNotFoundError);
    expect(p().planTemplate.update).not.toHaveBeenCalled();
  });
});

describe("resolveUnplacedHint", () => {
  beforeEach(() => {
    p().planTemplate.findUnique.mockResolvedValue({ status: "DRAFT", importHints: [unplaced("h1"), unplaced("h2")] });
  });
  it("a comida PER_DAY sin día → MealWeekdayMismatchError", async () => {
    p().templateMeal.findFirst.mockResolvedValue({ id: "m1", mode: "PER_DAY" });
    await expect(resolveUnplacedHint("t1", "h1", { kind: "meal", mealId: "m1", weekday: null })).rejects.toBeInstanceOf(
      MealWeekdayMismatchError,
    );
    expect(p().templateMealItem.create).not.toHaveBeenCalled();
  });
  it("a comida OK → crea el ítem de texto al final y borra el aviso", async () => {
    p().templateMeal.findFirst.mockResolvedValue({ id: "m1", mode: "PER_DAY" });
    p().templateMealItem.findFirst.mockResolvedValue({ order: 4 });
    await resolveUnplacedHint("t1", "h1", { kind: "meal", mealId: "m1", weekday: "WED" });
    expect(p().templateMeal.findFirst.mock.calls[0][0].where).toEqual({ id: "m1", templateId: "t1" });
    expect(p().templateMealItem.create.mock.calls[0][0].data).toMatchObject({ mealId: "m1", customLabel: "texto h1", weekday: "WED", order: 5, foodId: null });
    expect(p().planTemplate.update.mock.calls[0][0].data.importHints).toEqual([unplaced("h2")]);
  });
  it("a sección null → crea 'Texto importado'", async () => {
    await resolveUnplacedHint("t1", "h1", { kind: "section", sectionId: null });
    expect(p().planTemplateSection.create.mock.calls[0][0].data).toMatchObject({ templateId: "t1", title: "Texto importado", body: "texto h1" });
    expect(p().planTemplate.update.mock.calls[0][0].data.importHints).toEqual([unplaced("h2")]);
  });
});

describe("linkHintRecipe", () => {
  const hint = { id: "h1", kind: "RECIPE_SUGGESTION", label: "Tarta (2 unidades)", recipeId: "r2", recipeName: "Tarta", itemRef: "i4", itemId: "it4" };
  beforeEach(() => {
    p().planTemplate.findUnique.mockResolvedValue({ status: "DRAFT", importHints: [hint] });
  });
  it("receta no publicada → RecipeNotAvailableError", async () => {
    p().templateMealItem.findUnique.mockResolvedValue({ id: "it4", meal: { templateId: "t1" } });
    p().recipe.findUnique.mockResolvedValue({ status: "DRAFT" });
    await expect(linkHintRecipe("t1", "h1", 1)).rejects.toBeInstanceOf(RecipeNotAvailableError);
    expect(p().templateMealItem.update).not.toHaveBeenCalled();
  });
  it("ítem de otra plantilla → TemplateHintNotFoundError", async () => {
    p().templateMealItem.findUnique.mockResolvedValue({ id: "it4", meal: { templateId: "otra" } });
    await expect(linkHintRecipe("t1", "h1", 1)).rejects.toBeInstanceOf(TemplateHintNotFoundError);
  });
  it("OK → el ítem pasa a receta con porciones y sin alimento ni medida", async () => {
    p().templateMealItem.findUnique.mockResolvedValue({ id: "it4", meal: { templateId: "t1" } });
    p().recipe.findUnique.mockResolvedValue({ status: "PUBLISHED" });
    await linkHintRecipe("t1", "h1", 1.5);
    expect(p().templateMealItem.update).toHaveBeenCalledWith({
      where: { id: "it4" },
      data: {
        recipeId: "r2",
        portions: 1.5,
        customLabel: null,
        foodId: null,
        quantityGrams: null,
        measureQty: null,
        measureName: null,
        measurePlural: null,
        measureGrams: null,
      },
    });
    expect(p().planTemplate.update.mock.calls[0][0].data.importHints).toEqual([]);
  });
  it("portions 5 → RangeError", async () => {
    await expect(linkHintRecipe("t1", "h1", 5)).rejects.toBeInstanceOf(RangeError);
  });
});
