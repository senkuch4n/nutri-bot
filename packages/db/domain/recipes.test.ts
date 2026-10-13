// HU-018a: dominio de recetas (prisma mockeado, patrón de weeklyMenu.test.ts).
import { computeRecipeMacros } from "@nutri-bot/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const delegate = () => ({
  findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(),
  createMany: vi.fn(), count: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), groupBy: vi.fn(),
});

const mocks = vi.hoisted(() => ({ prisma: {} as Record<string, any> }));
vi.mock("../index", () => ({ prisma: mocks.prisma }));

import {
  RECIPE_ITEM_SELECT,
  RecipeNotFoundError,
  RecipeNotPublishableError,
  RecipeStatusError,
  archiveRecipe,
  countRecipesByStatus,
  createRecipe,
  deleteDraftRecipe,
  getRecipe,
  getRecipePhotoBytes,
  getRecipePreview,
  getRecipeUsage,
  listFoodsForRecipes,
  listPlanRecipePreviews,
  listRecipeCards,
  patientCanSeeRecipePhoto,
  publishRecipe,
  setRecipePhoto,
  unarchiveRecipe,
  updateRecipe,
  type RecipeInput,
} from "./recipes";

const p = () => mocks.prisma;
const dec = (v: number) => ({ toString: () => String(v) });

beforeEach(() => {
  vi.resetAllMocks();
  for (const key of ["recipe", "recipeIngredient", "recipePhoto", "recipeImportImage", "nutritionPlan", "planTemplate", "food"]) {
    mocks.prisma[key] = delegate();
  }
  mocks.prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
});

const validInput: RecipeInput = {
  name: "  Albóndigas de prueba ",
  type: "MAIN_DISH",
  moments: ["LUNCH", "DINNER"],
  tags: [],
  yieldPortions: 8,
  portionHousehold: "¾ albóndigas",
  portionGrams: null,
  preparation: "",
  tips: null,
  sourceName: null,
  published: { portionText: "1", kcal: 262, protein: null, carbs: null, fat: null, fiber: null },
  ingredients: [
    { foodId: "f1", label: null, grams: 500, noQuantity: false, household: "", rawText: null },
    { foodId: "f2", label: "Perejil", grams: 10, noQuantity: true, household: null, rawText: null },
    { foodId: null, label: "Pan rallado", grams: null, noQuantity: false, household: null, rawText: null },
  ],
};

describe("createRecipe", () => {
  it("con datos inválidos tira RecipeNotPublishableError con las issues y no crea nada", async () => {
    const err = await createRecipe({ ...validInput, name: "", moments: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(RecipeNotPublishableError);
    expect(err.issues.map((i: any) => i.field)).toEqual(["name", "moments"]);
    expect(p().recipe.create).not.toHaveBeenCalled();
    expect(p().$transaction).not.toHaveBeenCalled();
  });

  it("crea PUBLISHED/MANUAL, ignora la tabla publicada y normaliza ingredientes", async () => {
    p().recipe.create.mockResolvedValue({ id: "r1" });
    await expect(createRecipe(validInput)).resolves.toEqual({ id: "r1" });
    const data = p().recipe.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ name: "Albóndigas de prueba", status: "PUBLISHED", origin: "MANUAL", preparation: null });
    expect(data.publishedAt).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty("publishedKcal");
    const rows = p().recipeIngredient.createMany.mock.calls[0][0].data;
    expect(rows.map((r: any) => [r.recipeId, r.order, r.foodId, r.grams, r.noQuantity])).toEqual([
      ["r1", 0, "f1", 500, false],
      ["r1", 1, "f2", null, true], // c.n. no guarda gramos
      ["r1", 2, null, null, false],
    ]);
    expect(rows[0].household).toBeNull();
  });
});

describe("updateRecipe", () => {
  it("sobre PUBLISHED valida y usa una transacción: borra solo los ingredientes de esa receta y los recrea en orden", async () => {
    p().recipe.findUnique.mockResolvedValue({ id: "r1", status: "PUBLISHED", origin: "MANUAL", reviewedAt: null });
    await updateRecipe("r1", validInput);
    expect(p().$transaction).toHaveBeenCalledTimes(1);
    expect(p().recipeIngredient.deleteMany).toHaveBeenCalledWith({ where: { recipeId: "r1" } });
    const rows = p().recipeIngredient.createMany.mock.calls[0][0].data;
    expect(rows.map((r: any) => r.order)).toEqual([0, 1, 2]);
    expect(p().recipe.update.mock.calls[0][0].data).not.toHaveProperty("reviewedAt");
    await expect(updateRecipe("r1", { ...validInput, type: null })).rejects.toBeInstanceOf(RecipeNotPublishableError);
  });

  it("sobre DRAFT no valida y pone reviewedAt solo si era null", async () => {
    p().recipe.findUnique.mockResolvedValue({ id: "r1", status: "DRAFT", origin: "IMPORT", reviewedAt: null });
    await updateRecipe("r1", { ...validInput, name: "", type: null });
    const data = p().recipe.update.mock.calls[0][0].data;
    expect(data.reviewedAt).toBeInstanceOf(Date);
    expect(data.publishedKcal).toBe(262); // IMPORT sí escribe la tabla publicada

    p().recipe.findUnique.mockResolvedValue({ id: "r1", status: "DRAFT", origin: "IMPORT", reviewedAt: new Date("2026-10-01") });
    await updateRecipe("r1", validInput);
    expect(p().recipe.update.mock.calls[1][0].data).not.toHaveProperty("reviewedAt");
  });

  it("receta inexistente → RecipeNotFoundError", async () => {
    p().recipe.findUnique.mockResolvedValue(null);
    await expect(updateRecipe("x", validInput)).rejects.toBeInstanceOf(RecipeNotFoundError);
  });
});

describe("transiciones", () => {
  const draftRow = {
    status: "DRAFT", origin: "IMPORT", name: "X", type: "SNACK", moments: ["SNACK"], yieldPortions: dec(2),
    portionHousehold: "1 unidad", sourceName: "Fuente", ingredients: [{ foodId: "f1", label: null, grams: dec(30), noQuantity: false }],
  };

  it("publishRecipe solo desde DRAFT y borra las importImages", async () => {
    p().recipe.findUnique.mockResolvedValue(draftRow);
    await publishRecipe("r1");
    expect(p().recipe.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { status: "PUBLISHED", publishedAt: expect.any(Date) } });
    expect(p().recipeImportImage.deleteMany).toHaveBeenCalledWith({ where: { recipeId: "r1" } });

    p().recipe.findUnique.mockResolvedValue({ ...draftRow, status: "PUBLISHED" });
    await expect(publishRecipe("r1")).rejects.toBeInstanceOf(RecipeStatusError);
  });

  it("publishRecipe valida (falta el gramo → no publica)", async () => {
    p().recipe.findUnique.mockResolvedValue({ ...draftRow, ingredients: [{ foodId: "f1", label: null, grams: null, noQuantity: false }] });
    await expect(publishRecipe("r1")).rejects.toBeInstanceOf(RecipeNotPublishableError);
    expect(p().recipe.update).not.toHaveBeenCalled();
  });

  it("archiveRecipe solo desde PUBLISHED; unarchiveRecipe solo desde ARCHIVED", async () => {
    p().recipe.updateMany.mockResolvedValue({ count: 1 });
    await archiveRecipe("r1");
    expect(p().recipe.updateMany).toHaveBeenLastCalledWith({ where: { id: "r1", status: "PUBLISHED" }, data: { status: "ARCHIVED" } });
    await unarchiveRecipe("r1");
    expect(p().recipe.updateMany).toHaveBeenLastCalledWith({ where: { id: "r1", status: "ARCHIVED" }, data: { status: "PUBLISHED" } });

    p().recipe.updateMany.mockResolvedValue({ count: 0 });
    p().recipe.findUnique.mockResolvedValue({ id: "r1" });
    await expect(archiveRecipe("r1")).rejects.toBeInstanceOf(RecipeStatusError);
    await expect(unarchiveRecipe("r1")).rejects.toBeInstanceOf(RecipeStatusError);
    p().recipe.findUnique.mockResolvedValue(null);
    await expect(archiveRecipe("r1")).rejects.toBeInstanceOf(RecipeNotFoundError);
  });

  it("deleteDraftRecipe sobre PUBLISHED tira RecipeStatusError y no borra", async () => {
    p().recipe.findUnique.mockResolvedValue({ status: "PUBLISHED" });
    await expect(deleteDraftRecipe("r1")).rejects.toBeInstanceOf(RecipeStatusError);
    expect(p().recipe.delete).not.toHaveBeenCalled();
  });

  it("deleteDraftRecipe borra un DRAFT por id", async () => {
    p().recipe.findUnique.mockResolvedValue({ status: "DRAFT" });
    p().nutritionPlan.count.mockResolvedValue(0);
    p().planTemplate.count.mockResolvedValue(0);
    await deleteDraftRecipe("r1");
    expect(p().recipe.delete).toHaveBeenCalledWith({ where: { id: "r1" } });
  });
});

describe("foto", () => {
  it("setRecipePhoto hace delete + create en una transacción y devuelve el id nuevo", async () => {
    p().recipePhoto.create.mockResolvedValue({ id: "ph2" });
    const out = await setRecipePhoto("r1", { data: Buffer.from("a"), thumbData: Buffer.from("b"), byteSize: 1, credit: " " });
    expect(out).toEqual({ photoId: "ph2" });
    expect(p().$transaction).toHaveBeenCalledTimes(1);
    expect(p().recipePhoto.deleteMany).toHaveBeenCalledWith({ where: { recipeId: "r1" } });
    expect(p().recipePhoto.create.mock.calls[0][0].data).toMatchObject({ recipeId: "r1", byteSize: 1, credit: null, mimeType: "image/webp" });
  });

  it("getRecipePhotoBytes pide solo la columna del tamaño", async () => {
    p().recipePhoto.findUnique.mockResolvedValue({ thumbData: new Uint8Array([1, 2]), mimeType: "image/webp" });
    const thumb = await getRecipePhotoBytes("ph1", "thumb");
    expect(p().recipePhoto.findUnique.mock.calls[0][0].select).toEqual({ thumbData: true, mimeType: true });
    expect(thumb?.data).toEqual(Buffer.from([1, 2]));
    p().recipePhoto.findUnique.mockResolvedValue({ data: new Uint8Array([3]), mimeType: "image/webp" });
    await getRecipePhotoBytes("ph1", "full");
    expect(p().recipePhoto.findUnique.mock.calls[1][0].select).toEqual({ data: true, mimeType: true });
    p().recipePhoto.findUnique.mockResolvedValue(null);
    expect(await getRecipePhotoBytes("nope", "full")).toBeNull();
  });

  it("patientCanSeeRecipePhoto: plan ACTIVE del paciente", async () => {
    p().recipePhoto.findFirst.mockResolvedValue({ id: "ph1" });
    expect(await patientCanSeeRecipePhoto("pat1", "ph1")).toBe(true);
    expect(p().recipePhoto.findFirst).toHaveBeenCalledWith({
      where: { id: "ph1", recipe: { planItems: { some: { meal: { plan: { patientId: "pat1", status: "ACTIVE" } } } } } },
      select: { id: true },
    });
    p().recipePhoto.findFirst.mockResolvedValue(null);
    expect(await patientCanSeeRecipePhoto("pat1", "ph1")).toBe(false);
  });
});

describe("lecturas", () => {
  const food = (id: string, name: string, kcal: number, group = "LEGUMBRES_CEREALES") => ({
    id, name, group, source: "SARA2", active: true,
    kcalPer100: dec(kcal), proteinPer100: dec(10), carbsPer100: dec(20), fatPer100: dec(1), fiberPer100: null,
  });
  const row = {
    id: "r1", name: "Budín", status: "PUBLISHED", origin: "MANUAL", type: "DESSERT", moments: ["BREAKFAST"], tags: ["GLUTEN_FREE"],
    yieldPortions: dec(4), portionHousehold: "1 rodaja", sourceName: null, importFile: null, importPage: null,
    updatedAt: new Date("2026-10-03T10:00:00Z"), photo: { id: "ph1" }, importImages: [],
    ingredients: [
      { label: null, grams: dec(200), noQuantity: false, food: food("f1", "Harina de almendras, cruda", 600) },
      { label: "Limón", grams: null, noQuantity: true, food: null },
    ],
  };

  it("listRecipeCards: select sin bytes, perPortion de core y números sin Decimal", async () => {
    p().recipe.findMany.mockResolvedValue([row]);
    const [card] = await listRecipeCards({ status: "PUBLISHED" });
    const args = p().recipe.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ status: "PUBLISHED" });
    expect(JSON.stringify(args.select)).not.toMatch(/"data"|"thumbData"/);
    expect(args.select.photo).toEqual({ select: { id: true } });
    const expected = computeRecipeMacros(
      [{ label: null, grams: 200, noQuantity: false, food: { name: "Harina de almendras, cruda", group: "LEGUMBRES_CEREALES", kcalPer100: 600, proteinPer100: 10, carbsPer100: 20, fatPer100: 1, fiberPer100: 0 } },
       { label: "Limón", grams: null, noQuantity: true, food: null }],
      4,
    ).perPortion;
    expect(card!.perPortion).toEqual(expected);
    expect(card!.perPortion!.kcal).toBe(300);
    expect(card).toMatchObject({ photoId: "ph1", draftThumbId: null, macrosIncomplete: false, updatedAt: "2026-10-03T10:00:00.000Z" });
    expect(card!.searchText).toContain("limon");
    expect(card!.searchText).toContain("sin tacc");
  });

  it("getRecipe convierte Decimal a number y no trae bytes", async () => {
    p().recipe.findUnique.mockResolvedValue({
      ...row, portionGrams: dec(80.5), preparation: null, tips: null,
      publishedPortionText: null, publishedKcal: null, publishedProteinG: null, publishedCarbsG: null, publishedFatG: null, publishedFiberG: null,
      importRawText: null, importHints: null, reviewedAt: null, publishedAt: new Date("2026-10-03T10:00:00Z"),
      photo: { id: "ph1", credit: null },
      ingredients: row.ingredients.map((i, n) => ({ ...i, id: `i${n}`, order: n, household: null, rawText: null })),
    });
    const d = await getRecipe("r1");
    expect(JSON.stringify(p().recipe.findUnique.mock.calls[0][0].select)).not.toMatch(/"data"|"thumbData"/);
    expect(d).toMatchObject({ yieldPortions: 4, portionGrams: 80.5, published: null, import: null });
    expect(d!.ingredients[0]!.grams).toBe(200);
    expect(d!.ingredients[0]!.food!.kcalPer100).toBe(600);
    expect(d!.ingredients[0]!.food!.fiberPer100).toBe(0);
  });

  it("getRecipeUsage cuenta planes y plantillas distintos por recipeId", async () => {
    p().nutritionPlan.count.mockResolvedValue(3);
    p().planTemplate.count.mockResolvedValue(1);
    expect(await getRecipeUsage("r1")).toEqual({ plans: 3, templates: 1 });
    const where = { meals: { some: { items: { some: { recipeId: "r1" } } } } };
    expect(p().nutritionPlan.count).toHaveBeenCalledWith({ where });
    expect(p().planTemplate.count).toHaveBeenCalledWith({ where });
  });

  it("countRecipesByStatus completa los ceros", async () => {
    p().recipe.groupBy.mockResolvedValue([{ status: "PUBLISHED", _count: { _all: 5 } }]);
    expect(await countRecipesByStatus()).toEqual({ DRAFT: 0, PUBLISHED: 5, ARCHIVED: 0 });
  });

  it("listFoodsForRecipes incluye inactivos pedidos", async () => {
    p().food.findMany.mockResolvedValue([]);
    await listFoodsForRecipes(["old"]);
    expect(p().food.findMany.mock.calls[0][0].where).toEqual({ OR: [{ active: true }, { id: { in: ["old"] } }] });
    await listFoodsForRecipes();
    expect(p().food.findMany.mock.calls[1][0].where).toEqual({ active: true });
  });
});

describe("RECIPE_ITEM_SELECT (018c)", () => {
  it("trae lo del ítem de receta (macros, micronutrientes, foto, fuente) y nada de importación ni bytes", () => {
    expect(Object.keys(RECIPE_ITEM_SELECT).sort()).toEqual(
      ["id", "ingredients", "name", "photo", "portionHousehold", "sourceName", "status", "type", "yieldPortions"].sort(),
    );
    expect(RECIPE_ITEM_SELECT.photo).toEqual({ select: { id: true } });
    expect(RECIPE_ITEM_SELECT.ingredients.select.food.select).toMatchObject({ nutrients: true, sodiumMgPer100: true, kcalPer100: true });
    // No filtra por estado: una receta archivada sigue en el plan.
    expect(RECIPE_ITEM_SELECT).not.toHaveProperty("where");
    expect(JSON.stringify(RECIPE_ITEM_SELECT)).not.toMatch(/rawText|importHints|data|thumbData|published/);
  });
});

describe("RecipePreview (018c-2)", () => {
  const food = { id: "f1", name: "Avena, arrollada", group: "LEGUMBRES_CEREALES", source: "SARA2", active: true,
    kcalPer100: dec(400), proteinPer100: dec(12), carbsPer100: dec(60), fatPer100: dec(8), fiberPer100: dec(10) };
  const row = {
    id: "r1", name: "Panqueques", status: "PUBLISHED", type: "BREAKFAST", portionHousehold: "2 panqueques",
    yieldPortions: dec(4), sourceName: "Nutriarte", preparation: "Mezclar.", tips: "Se freezan.",
    photo: { id: "ph1", credit: "Foto propia" },
    ingredients: [
      { label: null, grams: dec(200), noQuantity: false, household: "2 tazas", food },
      { label: "Canela", grams: null, noQuantity: true, household: null, food: null },
    ],
  };

  it("getRecipePreview excluye borradores, no pide datos de importación y arma los nombres con ingredientDisplayName", async () => {
    p().recipe.findFirst.mockResolvedValue(row);
    const r = await getRecipePreview("r1");
    const args = p().recipe.findFirst.mock.calls[0][0];
    expect(args.where).toEqual({ id: "r1", status: { not: "DRAFT" } });
    expect(JSON.stringify(args.select)).not.toMatch(/rawText|importHints|importRawText|published|"data"|thumbData/);
    expect(r).not.toBeNull();
    expect(JSON.stringify(r)).not.toMatch(/rawText|importHints|published/);
    expect(r!.ingredients).toEqual([
      { name: "Avena", household: "2 tazas", grams: 200, noQuantity: false },
      { name: "Canela", household: null, grams: null, noQuantity: true },
    ]);
    expect(r).toMatchObject({ yieldPortions: 4, photo: { id: "ph1", credit: "Foto propia" }, sourceName: "Nutriarte", macrosIncomplete: false });
    expect(r!.perPortion!.kcal).toBe(200);
  });

  it("getRecipePreview da null si la receta es un borrador o no existe", async () => {
    p().recipe.findFirst.mockResolvedValue(null);
    expect(await getRecipePreview("draft")).toBeNull();
  });

  it("listPlanRecipePreviews pide recetas distintas del plan, sin borradores y por nombre", async () => {
    p().recipe.findMany.mockResolvedValue([row]);
    const list = await listPlanRecipePreviews("plan1");
    const args = p().recipe.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ status: { not: "DRAFT" }, planItems: { some: { meal: { planId: "plan1" } } } });
    expect(args.orderBy).toEqual({ name: "asc" });
    expect(list.map((x) => x.id)).toEqual(["r1"]);
  });
});
