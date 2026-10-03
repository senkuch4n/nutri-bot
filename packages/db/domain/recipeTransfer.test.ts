// HU-018a-2: pase a producción por bundle (prisma mockeado). Recetas y alimentos INVENTADOS.
import type { RecipeBundle, RecipeBundleRecipe } from "@nutri-bot/core/recipe-import";
import { beforeEach, describe, expect, it, vi } from "vitest";

const delegate = () => ({
  findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(),
  createMany: vi.fn(), count: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), groupBy: vi.fn(),
});

const mocks = vi.hoisted(() => ({ prisma: {} as Record<string, any> }));
vi.mock("../index", () => ({ prisma: mocks.prisma }));

import { DRY_RUN_ID, exportPublishedRecipes, importRecipeBundle } from "./recipeTransfer";

const p = () => mocks.prisma;
const dec = (v: number) => ({ toString: () => String(v) });

beforeEach(() => {
  vi.resetAllMocks();
  for (const key of ["recipe", "recipeIngredient", "recipePhoto", "food"]) mocks.prisma[key] = delegate();
  mocks.prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
});

function recipe(over: Partial<RecipeBundleRecipe> = {}): RecipeBundleRecipe {
  return {
    importKey: "inventado:p3:bolitas de mijo",
    name: "Bolitas de mijo",
    origin: "IMPORT",
    type: "MAIN_DISH",
    moments: ["LUNCH"],
    tags: [],
    yieldPortions: 8,
    portionHousehold: "3 bolitas",
    portionGrams: null,
    preparation: "Mezclar.",
    tips: null,
    sourceName: "Recetario inventado",
    published: null,
    importFile: "Recetario inventado.pdf",
    importPage: 3,
    ingredients: [
      { order: 0, label: null, grams: 200, noQuantity: false, household: null, rawText: "Mijo 200g", food: { sourceKey: "sara2:t01:mijo" } },
      { order: 1, label: "Sal", grams: null, noQuantity: true, household: null, rawText: null, food: null },
    ],
    photo: null,
    ...over,
  };
}

const bundle = (...recipes: RecipeBundleRecipe[]): RecipeBundle => ({ format: 1, exportedAt: "2026-10-03T00:00:00Z", recipes });

const ownMix = { ownName: "Mix de semillas", per100: { kcal: 500, protein: 20, carbs: 10, fat: 40, fiber: 15 } };
const ownRow = (id: string, name: string, kcal = 500) => ({
  id, name, kcalPer100: dec(kcal), proteinPer100: dec(20), carbsPer100: dec(10), fatPer100: dec(40), fiberPer100: dec(15),
});

function mockFoods(sara: { id: string; sourceKey: string }[], own: ReturnType<typeof ownRow>[]) {
  p().food.findMany.mockImplementation(async (args: any) =>
    args.where.source === "SARA2" ? sara.map((s) => ({ ...s, active: true })) : own,
  );
}

describe("importRecipeBundle", () => {
  it("mapea SARA2 por sourceKey y crea la receta PUBLISHED con sus ingredientes", async () => {
    mockFoods([{ id: "food-mijo", sourceKey: "sara2:t01:mijo" }], []);
    p().recipe.findUnique.mockResolvedValue(null);
    p().recipe.create.mockResolvedValue({ id: "prod1" });
    const out = await importRecipeBundle(bundle(recipe()), { dryRun: false });
    expect(out).toEqual([{ importKey: "inventado:p3:bolitas de mijo", result: "created", id: "prod1" }]);
    expect(p().recipe.create.mock.calls[0][0].data).toMatchObject({ status: "PUBLISHED", origin: "IMPORT", importKey: "inventado:p3:bolitas de mijo" });
    const rows = p().recipeIngredient.createMany.mock.calls[0][0].data;
    expect(rows.map((r: any) => [r.foodId, r.grams, r.noQuantity])).toEqual([["food-mijo", 200, false], [null, null, true]]);
  });

  it("SARA2 con sourceKey que no existe → skipped-food", async () => {
    mockFoods([], []);
    p().recipe.findUnique.mockResolvedValue(null);
    const [o] = await importRecipeBundle(bundle(recipe()), { dryRun: false });
    expect(o).toEqual({ importKey: "inventado:p3:bolitas de mijo", result: "skipped-food", detail: "SARA2 sourceKey no encontrado: sara2:t01:mijo" });
    expect(p().recipe.create).not.toHaveBeenCalled();
  });

  it("PROPIO: una coincidencia con los mismos macros se usa; 2 coincidencias o macros distintos → skipped-food", async () => {
    const r = recipe({ ingredients: [{ order: 0, label: null, grams: 30, noQuantity: false, household: null, rawText: null, food: ownMix }] });
    p().recipe.findUnique.mockResolvedValue(null);
    p().recipe.create.mockResolvedValue({ id: "prod2" });

    mockFoods([], [ownRow("own1", "Mix de semillas")]);
    expect((await importRecipeBundle(bundle(r), { dryRun: false }))[0]).toMatchObject({ result: "created" });

    mockFoods([], [ownRow("own1", "Mix de semillas"), ownRow("own2", "MIX DE SEMILLAS")]);
    expect((await importRecipeBundle(bundle(r), { dryRun: false }))[0]).toEqual({
      importKey: r.importKey,
      result: "skipped-food",
      detail: "Hay 2 alimentos propios «Mix de semillas»",
    });

    mockFoods([], [ownRow("own1", "Mix de semillas", 480)]);
    expect((await importRecipeBundle(bundle(r), { dryRun: false }))[0]).toMatchObject({ result: "skipped-food", detail: expect.stringMatching(/otros valores/) });

    mockFoods([], []);
    expect((await importRecipeBundle(bundle(r), { dryRun: false }))[0]).toMatchObject({ detail: "Falta el alimento propio «Mix de semillas»" });
    expect(p().recipe.create).toHaveBeenCalledTimes(1);
  });

  it("una receta que ya existe → skipped-exists y no se toca (idempotente por importKey)", async () => {
    mockFoods([{ id: "food-mijo", sourceKey: "sara2:t01:mijo" }], []);
    p().recipe.findUnique.mockResolvedValue({ id: "ya" });
    expect(await importRecipeBundle(bundle(recipe()), { dryRun: false })).toEqual([{ importKey: "inventado:p3:bolitas de mijo", result: "skipped-exists" }]);
    expect(p().recipe.create).not.toHaveBeenCalled();
    expect(p().recipe.update).not.toHaveBeenCalled();
    expect(p().recipe.updateMany).not.toHaveBeenCalled();
  });

  it("dryRun no llama a create", async () => {
    mockFoods([{ id: "food-mijo", sourceKey: "sara2:t01:mijo" }], []);
    p().recipe.findUnique.mockResolvedValue(null);
    expect(await importRecipeBundle(bundle(recipe()), { dryRun: true })).toEqual([
      { importKey: "inventado:p3:bolitas de mijo", result: "created", id: DRY_RUN_ID },
    ]);
    expect(p().recipe.create).not.toHaveBeenCalled();
    expect(p().$transaction).not.toHaveBeenCalled();
  });

  it("una receta que no valida para publicar → skipped-invalid con los mensajes", async () => {
    mockFoods([{ id: "food-mijo", sourceKey: "sara2:t01:mijo" }], []);
    p().recipe.findUnique.mockResolvedValue(null);
    const [o] = await importRecipeBundle(bundle(recipe({ sourceName: null, moments: [] })), { dryRun: false });
    expect(o).toMatchObject({ result: "skipped-invalid" });
    if (o?.result === "skipped-invalid") expect(o.issues).toHaveLength(2);
    expect(p().recipe.create).not.toHaveBeenCalled();
  });
});

describe("exportPublishedRecipes", () => {
  it("por defecto exporta PUBLISHED de origen IMPORT; SARA2 por sourceKey y propios con sus macros", async () => {
    p().recipe.findMany.mockResolvedValue([
      {
        id: "dev1", importKey: null, name: "Receta manual", origin: "MANUAL", type: "SNACK", moments: ["SNACK"], tags: [],
        yieldPortions: dec(2), portionHousehold: "1 taza", portionGrams: null, preparation: null, tips: null, sourceName: null,
        publishedPortionText: null, publishedKcal: null, publishedProteinG: null, publishedCarbsG: null, publishedFatG: null, publishedFiberG: null,
        importFile: null, importPage: null,
        ingredients: [
          { order: 0, label: null, grams: dec(50), noQuantity: false, household: null, rawText: null,
            food: { name: "Mijo", source: "SARA2", sourceKey: "sara2:t01:mijo", kcalPer100: dec(1), proteinPer100: dec(1), carbsPer100: dec(1), fatPer100: dec(1), fiberPer100: null } },
          { order: 1, label: null, grams: dec(10), noQuantity: false, household: null, rawText: null,
            food: { name: "Mix de semillas", source: "PROPIO", sourceKey: null, kcalPer100: dec(500), proteinPer100: dec(20), carbsPer100: dec(10), fatPer100: dec(40), fiberPer100: null } },
        ],
        photo: { data: Buffer.from("full"), thumbData: Buffer.from("th"), credit: "Foto: X" },
      },
    ]);
    const b = await exportPublishedRecipes({});
    expect(p().recipe.findMany.mock.calls[0][0].where).toEqual({ status: "PUBLISHED", origin: "IMPORT" });
    const r = b.recipes[0]!;
    expect(r.importKey).toBe("manual:dev1");
    expect(r.yieldPortions).toBe(2);
    expect(r.ingredients[0]!.food).toEqual({ sourceKey: "sara2:t01:mijo" });
    expect(r.ingredients[1]!.food).toEqual({ ownName: "Mix de semillas", per100: { kcal: 500, protein: 20, carbs: 10, fat: 40, fiber: 0 } });
    expect(r.photo).toEqual({ dataBase64: Buffer.from("full").toString("base64"), thumbBase64: Buffer.from("th").toString("base64"), credit: "Foto: X" });
  });

  it("con ids exporta esas (cualquier origen)", async () => {
    p().recipe.findMany.mockResolvedValue([]);
    await exportPublishedRecipes({ ids: ["a", "b"] });
    expect(p().recipe.findMany.mock.calls[0][0].where).toEqual({ status: "PUBLISHED", id: { in: ["a", "b"] } });
  });
});
