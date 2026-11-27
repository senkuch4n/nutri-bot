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
  recipesForTenant,
  setRecipePhoto,
  unarchiveRecipe,
  updateRecipe,
  type RecipeInput,
} from "./recipes";

const T = { tenantId: "legacy-tenant" };

const p = () => mocks.prisma;
const dec = (v: number) => ({ toString: () => String(v) });

beforeEach(() => {
  vi.resetAllMocks();
  for (const key of ["recipe", "recipeIngredient", "recipePhoto", "recipeImportImage", "nutritionPlan", "planTemplate", "food"]) {
    mocks.prisma[key] = delegate();
  }
  p().food.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => [
    { id: "f1", source: "SARA2", tenantId: null, active: false, catalogPresent: false },
    { id: "f2", source: "PROPIO", tenantId: "tenant-a" },
    { id: "foreign-food", source: "PROPIO", tenantId: "tenant-b" },
    { id: "unowned-food", source: "PROPIO", tenantId: null },
  ].filter(({ id }) => where.id.in.includes(id)));
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

describe("tenant recipe media", () => {
  const recipes = recipesForTenant("tenant-a");
  const photo = { data: Buffer.from("full"), thumbData: Buffer.from("thumb"), byteSize: 4, credit: " credit " };
  const where = { recipeId: "r1", recipe: { tenantId: "tenant-a" } };

  it("selects bytes only from the photo's owning recipe", async () => {
    const rows = [{ id: "own", tenantId: "tenant-a" }, { id: "foreign", tenantId: "tenant-b" }];
    p().recipePhoto.findUnique.mockImplementation(({ where, select }: {
      where: { id: string; recipe?: { tenantId: string } }; select: { data?: boolean };
    }) => rows.some((row) => row.id === where.id && row.tenantId === where.recipe?.tenantId)
      ? { ...(select.data ? { data: photo.data } : { thumbData: photo.thumbData }), mimeType: "image/webp" } : null);
    expect(await recipes.getPhotoBytes("foreign", "full")).toBeNull();
    expect(await recipes.getPhotoBytes("own", "full")).toEqual({ data: photo.data, mimeType: "image/webp" });
    expect(await recipes.getPhotoBytes("own", "thumb")).toEqual({ data: photo.thumbData, mimeType: "image/webp" });
  });

  it("rejects replacement before any write when the recipe is not owned", async () => {
    p().$queryRaw = vi.fn().mockResolvedValue([]);
    await expect(recipes.setPhoto("r1", photo)).rejects.toBeInstanceOf(RecipeNotFoundError);
    expect(p().$queryRaw.mock.calls[0][0].join("?")).toContain('FROM "Recipe" WHERE id = ? AND "tenantId" = ? FOR UPDATE');
    expect(p().$queryRaw.mock.calls[0].slice(1)).toEqual(["r1", "tenant-a"]);
    expect(p().recipePhoto.deleteMany).not.toHaveBeenCalled();
    expect(p().recipePhoto.create).not.toHaveBeenCalled();
  });

  it("replaces an owned photo atomically and returns a new image ID", async () => {
    p().$queryRaw = vi.fn().mockResolvedValue([{ id: "r1" }]);
    p().recipePhoto.create.mockResolvedValue({ id: "new-photo" });
    expect(await recipes.setPhoto("r1", photo)).toEqual({ photoId: "new-photo" });
    expect(p().$transaction).toHaveBeenCalledTimes(1);
    expect(p().recipePhoto.deleteMany).toHaveBeenCalledWith({ where });
    expect(p().recipePhoto.create).toHaveBeenCalledWith({
      data: { ...photo, recipeId: "r1", credit: "credit", mimeType: "image/webp" }, select: { id: true },
    });
  });

  it("always predicates remove and credit-only writes on the owning recipe, including the no-photo case", async () => {
    p().recipePhoto.deleteMany.mockResolvedValue({ count: 0 });
    p().recipePhoto.updateMany.mockResolvedValue({ count: 0 });
    await expect(recipes.removePhoto("r1")).resolves.toBeUndefined();
    await expect(recipes.setPhotoCredit("r1", " ")).resolves.toBeUndefined();
    expect(p().recipePhoto.deleteMany).toHaveBeenCalledWith({ where });
    expect(p().recipePhoto.updateMany).toHaveBeenCalledWith({ where, data: { credit: null } });
  });
});

describe("direct tenant recipe operations", () => {
  const tenantId = "tenant-a";
  const foreign = { id: "foreign", tenantId: "tenant-b", status: "PUBLISHED", origin: "MANUAL" };
  const own = { ...foreign, id: "own", tenantId };
  const rows = [foreign, own];

  it("scopes list, counts and detail to the same owner", async () => {
    type RecipeFilter = { where: { tenantId: string; status?: string; id?: string } };
    p().recipe.findMany.mockImplementation(async ({ where }: RecipeFilter) => rows.filter((r) => r.tenantId === where.tenantId && r.status === where.status)
      .map((r) => ({ ...r, name: r.id, ingredients: [], tags: [], updatedAt: new Date() })));
    p().recipe.groupBy.mockImplementation(async ({ where }: RecipeFilter) => [{ status: "PUBLISHED", _count: { _all: rows.filter((r) => r.tenantId === where.tenantId).length } }]);
    p().recipe.findUnique.mockImplementation(async ({ where }: RecipeFilter) => rows.find((r) => r.id === where.id && r.tenantId === where.tenantId) ?? null);
    const recipes = recipesForTenant(tenantId);
    expect((await recipes.list("PUBLISHED")).map((r) => r.id)).toEqual(["own"]);
    expect(await recipes.counts()).toEqual({ PUBLISHED: 1, DRAFT: 0, ARCHIVED: 0 });
    expect(await recipes.get("foreign")).toBeNull();
    expect(p().recipe.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "foreign", tenantId } }));
  });

  it("creates with the trusted owner and scopes the actual edit before replacing ingredients", async () => {
    p().recipe.create.mockResolvedValue({ id: "new" });
    p().recipe.findUnique.mockResolvedValue(own);
    p().recipe.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const recipes = recipesForTenant(tenantId);
    await expect(recipes.create(validInput)).resolves.toEqual({ id: "new" });
    expect(p().recipe.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId }) }));
    await recipes.update("own", validInput);
    expect(p().recipe.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "own", tenantId } }));
    expect(p().recipeIngredient.deleteMany).toHaveBeenCalledWith({ where: { recipeId: "own" } });
    await expect(recipes.update("own", validInput)).rejects.toThrow("La receta no existe.");
    expect(p().recipeIngredient.deleteMany).toHaveBeenCalledTimes(1);
    expect(p().recipeIngredient.createMany).toHaveBeenCalledTimes(2); // one create and one successful edit
    p().recipe.findUnique.mockResolvedValue(null);
    await expect(recipes.update("foreign", validInput)).rejects.toThrow("La receta no existe.");
    expect(p().recipe.findUnique).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: "foreign", tenantId } }));
    expect(p().recipe.updateMany).toHaveBeenCalledTimes(2);
  });

  it.each(["create", "update", "updateDraft"] as const)("%s rejects foreign, unowned and missing foods before any mutation", async (operation) => {
    p().recipe.findUnique.mockResolvedValue({ ...own, status: operation === "updateDraft" ? "DRAFT" : "PUBLISHED" });
    p().recipe.create.mockResolvedValue({ id: "new" });
    p().recipe.updateMany.mockResolvedValue({ count: 1 });
    const recipes = recipesForTenant(tenantId);
    const input = { ...validInput, ingredients: ["foreign-food", "unowned-food", "missing"].map((foodId) => ({ ...validInput.ingredients[0]!, foodId })) };
    await expect(operation === "create" ? recipes.create(input) : recipes[operation]("own", input)).rejects.toMatchObject({
      name: "RecipeNotPublishableError",
      issues: [0, 1, 2].map((index) => ({ field: "ingredient", index, message: "El alimento no está disponible para este consultorio." })),
    });
    expect(p().recipe.create).not.toHaveBeenCalled();
    expect(p().recipe.updateMany).not.toHaveBeenCalled();
    expect(p().recipeIngredient.deleteMany).not.toHaveBeenCalled();
    expect(p().recipeIngredient.createMany).not.toHaveBeenCalled();
  });

  it.each([["archive", "PUBLISHED", "ARCHIVED"], ["unarchive", "ARCHIVED", "PUBLISHED"]] as const)(
    "%s guards the actual transition and conceals foreign IDs", async (method, from, to) => {
      p().recipe.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
      p().recipe.findUnique.mockResolvedValue(null);
      const recipes = recipesForTenant(tenantId);
      await expect(recipes[method]("own")).resolves.toBeUndefined();
      await expect(recipes[method]("foreign")).rejects.toThrow("La receta no existe.");
      expect(p().recipe.updateMany.mock.calls.map(([args]: [unknown]) => args)).toEqual(["own", "foreign"].map((id) => ({
        where: { id, tenantId, status: from }, data: { status: to },
      })));
      expect(p().recipe.findUnique).toHaveBeenCalledWith({ where: { id: "foreign", tenantId }, select: { id: true } });
    },
  );
});

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
    expect(p().food.findMany).not.toHaveBeenCalled();
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
    expect(p().food.findMany).not.toHaveBeenCalled();
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

  const scoped = recipesForTenant("tenant-a");
  const draftFilter = { id: "own", tenantId: "tenant-a", status: "DRAFT" };

  it("rejects a foreign draft for all three operations before any mutation", async () => {
    p().recipe.findUnique.mockImplementation(({ where }: { where: { id: string; tenantId?: string } }) =>
      where.id === "foreign" && (!where.tenantId || where.tenantId === "tenant-b") ? draftRow : null);
    await expect(scoped.updateDraft("foreign", validInput)).rejects.toBeInstanceOf(RecipeNotFoundError);
    await expect(scoped.publishDraft("foreign")).rejects.toBeInstanceOf(RecipeNotFoundError);
    await expect(scoped.discardDraft("foreign")).rejects.toBeInstanceOf(RecipeNotFoundError);
    expect(p().recipe.updateMany).not.toHaveBeenCalled();
    expect(p().recipeIngredient.deleteMany).not.toHaveBeenCalled();
    expect(p().recipeImportImage.deleteMany).not.toHaveBeenCalled();
    expect(p().recipe.deleteMany).not.toHaveBeenCalled();
  });

  it("updates an owned draft and marks review, but does not replace ingredients if the guarded write fails", async () => {
    p().recipe.findUnique.mockResolvedValue({ ...draftRow, reviewedAt: null });
    p().recipe.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await scoped.updateDraft("own", validInput);
    expect(p().recipe.updateMany).toHaveBeenCalledWith({ where: draftFilter, data: expect.objectContaining({ reviewedAt: expect.any(Date) }) });
    p().recipe.findUnique.mockResolvedValueOnce(draftRow).mockResolvedValueOnce({ status: "PUBLISHED" });
    await expect(scoped.updateDraft("own", validInput)).rejects.toBeInstanceOf(RecipeStatusError);
    expect(p().recipeIngredient.deleteMany).toHaveBeenCalledTimes(1);
    expect(p().recipeIngredient.createMany).toHaveBeenCalledTimes(1);
  });

  it("cannot publish a stored draft with an unresolved food link or remove its images", async () => {
    p().recipe.findUnique.mockResolvedValue({ ...draftRow, ingredients: [{ ...draftRow.ingredients[0], foodId: "unowned-food" }] });
    p().recipe.updateMany.mockResolvedValue({ count: 1 });
    await expect(scoped.publishDraft("own")).rejects.toMatchObject({
      name: "RecipeNotPublishableError", issues: [{ field: "ingredient", index: 0, message: "El alimento no está disponible para este consultorio." }],
    });
    expect(p().recipe.updateMany).not.toHaveBeenCalled();
    expect(p().recipeImportImage.deleteMany).not.toHaveBeenCalled();
  });

  it("publishes an owned draft before cleaning its images, never after a failed guarded write", async () => {
    p().recipe.findUnique.mockResolvedValue(draftRow);
    p().recipe.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await scoped.publishDraft("own");
    expect(p().recipe.updateMany).toHaveBeenCalledWith({ where: draftFilter, data: { status: "PUBLISHED", publishedAt: expect.any(Date) } });
    expect(p().recipeImportImage.deleteMany).toHaveBeenCalledWith({ where: { recipeId: "own", recipe: { tenantId: "tenant-a" } } });
    await expect(scoped.publishDraft("own")).rejects.toBeInstanceOf(RecipeStatusError);
    expect(p().recipeImportImage.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("discards only an owned draft without dependent items", async () => {
    p().recipe.findUnique.mockResolvedValue(draftRow);
    p().recipe.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await scoped.discardDraft("own");
    expect(p().recipe.deleteMany).toHaveBeenCalledWith({
      where: { ...draftFilter, planItems: { none: {} }, templateItems: { none: {} } },
    });
    await expect(scoped.discardDraft("own")).rejects.toThrow("La receta se usa en planes o plantillas.");
    expect(p().recipe.delete).not.toHaveBeenCalled();
  });

  it("publishRecipe solo desde DRAFT y borra las importImages", async () => {
    p().recipe.findUnique.mockResolvedValue(draftRow);
    await publishRecipe("r1");
    expect(p().recipe.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { status: "PUBLISHED", publishedAt: expect.any(Date) } });
    expect(p().recipeImportImage.deleteMany).toHaveBeenCalledWith({ where: { recipeId: "r1" } });
    expect(p().food.findMany).not.toHaveBeenCalled();

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

  it("patientCanSeeRecipePhoto: receta del consultorio y plan ACTIVE del paciente en ese consultorio (HU-033)", async () => {
    p().recipePhoto.findFirst.mockResolvedValue({ id: "ph1" });
    expect(await patientCanSeeRecipePhoto({ tenantId: "tenant-a" }, "pat1", "ph1")).toBe(true);
    expect(p().recipePhoto.findFirst).toHaveBeenCalledWith({
      where: {
        id: "ph1",
        recipe: {
          tenantId: "tenant-a",
          planItems: {
            some: { meal: { plan: { patientId: "pat1", tenantId: "tenant-a", status: "ACTIVE", patient: { tenantId: "tenant-a" } } } },
          },
        },
      },
      select: { id: true },
    });
    p().recipePhoto.findFirst.mockResolvedValue(null);
    expect(await patientCanSeeRecipePhoto({ tenantId: "tenant-a" }, "pat1", "ph1")).toBe(false);
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

  it("recipesForTenant().foods usa la visibilidad del consultorio (preferencia de SARA 2), no la columna global active", async () => {
    const row = (id: string, extra: Record<string, unknown>) => ({
      id, name: id, group: "VERDURAS", kcalPer100: dec(10), proteinPer100: dec(1), carbsPer100: dec(1), fatPer100: dec(0),
      fiberPer100: null, ...extra,
    });
    p().food.findMany.mockResolvedValue([
      // SARA 2 con columna global en false pero sin preferencia del tenant: visible (manda la preferencia).
      row("sara-global-off", { source: "SARA2", active: false, catalogActive: true, visibility: [] }),
      // SARA 2 que el tenant ocultó (pedido por la receta): entra marcado inactivo.
      row("sara-hidden", { source: "SARA2", active: true, catalogActive: true, visibility: [{ visible: false }] }),
      row("own", { source: "PROPIO", active: true, catalogActive: true, visibility: [] }),
    ]);
    const foods = await recipesForTenant("tenant-a").foods(["sara-hidden"]);
    expect(foods.map((f) => [f.id, f.active])).toEqual([["sara-global-off", true], ["sara-hidden", false], ["own", true]]);

    const visible = {
      OR: [
        { source: "SARA2", catalogActive: true, visibility: { none: { tenantId: "tenant-a", visible: false } } },
        { source: "PROPIO", tenantId: "tenant-a", active: true },
      ],
    };
    const call = p().food.findMany.mock.calls[0][0];
    expect(call.where).toEqual({
      AND: [
        { OR: [{ source: "SARA2" }, { source: "PROPIO", tenantId: "tenant-a" }] },
        { OR: [visible, { id: { in: ["sara-hidden"] } }] },
      ],
    });
    // La preferencia que se lee es solo la de este consultorio: la de otro no afecta.
    expect(call.select.visibility).toEqual({ where: { tenantId: "tenant-a" }, select: { visible: true }, take: 1 });

    await recipesForTenant("tenant-a").foods();
    expect(p().food.findMany.mock.calls[1][0].where).toEqual(visible);
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

  it("getRecipePreview limita el picker a su tenant sin esconder recetas propias archivadas", async () => {
    const archived = { ...row, status: "ARCHIVED" };
    p().recipe.findFirst.mockImplementation(({ where }: { where: { tenantId?: string } }) =>
      where.tenantId === "tenant-a" ? null : archived);
    expect(await getRecipePreview("r1", "tenant-a")).toBeNull();
    expect(await getRecipePreview("r1", "tenant-b")).toMatchObject({ id: "r1", status: "ARCHIVED" });
    for (const tenantId of ["tenant-a", "tenant-b"]) {
      expect(p().recipe.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "r1", tenantId, status: { not: "DRAFT" } },
      }));
    }
  });

  it("getRecipePreview da null si la receta es un borrador o no existe", async () => {
    p().recipe.findFirst.mockResolvedValue(null);
    expect(await getRecipePreview("draft")).toBeNull();
  });

  it("listPlanRecipePreviews pide recetas distintas del plan, sin borradores y por nombre", async () => {
    p().recipe.findMany.mockResolvedValue([row]);
    const list = await listPlanRecipePreviews(T, "plan1");
    const args = p().recipe.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      tenantId: "legacy-tenant",
      status: { not: "DRAFT" },
      planItems: { some: { meal: { planId: "plan1", plan: { tenantId: "legacy-tenant", patient: { tenantId: "legacy-tenant" } } } } },
    });
    expect(args.orderBy).toEqual({ name: "asc" });
    expect(list.map((x) => x.id)).toEqual(["r1"]);
  });
});
