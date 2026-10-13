import {
  computeRecipeMacros,
  recipeSearchText,
  validateRecipeForPublish,
  type FoodGroupKey,
  type Macros,
  type RecipeIngredientForMacros,
  type RecipeMomentKey,
  type RecipePublishIssue,
  type RecipeStatusKey,
  type RecipeTagKey,
  type RecipeTypeKey,
} from "@nutri-bot/core";
import { prisma, type Prisma } from "../index";

// HU-018a: recetario. Los macros no se guardan: se calculan con computeRecipeMacros (core) desde
// los ingredientes cada vez que se leen (D4, D10). Ninguna función devuelve bytes, salvo
// getRecipePhotoBytes; todas las consultas usan `select` explícito.

type Dec = Prisma.Decimal | null | undefined;
const num = (d: Dec): number | null => (d === null || d === undefined ? null : Number(d.toString()));
const num0 = (d: Dec): number => num(d) ?? 0;

const MACRO_FOOD_SELECT = {
  id: true,
  name: true,
  group: true,
  source: true,
  active: true,
  kcalPer100: true,
  proteinPer100: true,
  carbsPer100: true,
  fatPer100: true,
  fiberPer100: true,
} satisfies Prisma.FoodSelect;

type MacroFoodRow = Prisma.FoodGetPayload<{ select: typeof MACRO_FOOD_SELECT }>;

export interface RecipeCatalogFood {
  id: string;
  name: string;
  group: string;
  source: "SARA2" | "PROPIO";
  active: boolean;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  fiberPer100: number;
}

function toCatalogFood(f: MacroFoodRow): RecipeCatalogFood {
  return {
    id: f.id,
    name: f.name,
    group: f.group,
    source: f.source,
    active: f.active,
    kcalPer100: num0(f.kcalPer100),
    proteinPer100: num0(f.proteinPer100),
    carbsPer100: num0(f.carbsPer100),
    fatPer100: num0(f.fatPer100),
    fiberPer100: num0(f.fiberPer100),
  };
}

function toMacroIngredient(i: {
  label: string | null;
  grams: Dec;
  noQuantity: boolean;
  food: MacroFoodRow | null;
}): RecipeIngredientForMacros {
  return {
    label: i.label,
    grams: num(i.grams),
    noQuantity: i.noQuantity,
    food: i.food ? { ...toCatalogFood(i.food), group: i.food.group as FoodGroupKey } : null,
  };
}

// ── Lista ─────────────────────────────────────────────────────────────────────────────────────

/** Tarjeta de la grilla (lista y buscador de 018c). Serializable: sin Decimal ni Date. */
export interface RecipeCard {
  id: string;
  name: string;
  status: RecipeStatusKey;
  origin: "MANUAL" | "IMPORT";
  type: RecipeTypeKey | null;
  moments: RecipeMomentKey[];
  tags: RecipeTagKey[];
  portionHousehold: string | null;
  perPortion: Macros | null;
  macrosIncomplete: boolean;
  photoId: string | null;
  draftThumbId: string | null;
  sourceName: string | null;
  importFile: string | null;
  importPage: number | null;
  searchText: string;
  updatedAt: string;
}

const RECIPE_CARD_SELECT = {
  id: true,
  name: true,
  status: true,
  origin: true,
  type: true,
  moments: true,
  tags: true,
  yieldPortions: true,
  portionHousehold: true,
  sourceName: true,
  importFile: true,
  importPage: true,
  updatedAt: true,
  photo: { select: { id: true } },
  importImages: {
    where: { kind: "CANDIDATE" },
    orderBy: { order: "asc" },
    take: 1,
    select: { id: true },
  },
  ingredients: {
    orderBy: { order: "asc" },
    select: { label: true, grams: true, noQuantity: true, food: { select: MACRO_FOOD_SELECT } },
  },
} satisfies Prisma.RecipeSelect;

type RecipeCardRow = Prisma.RecipeGetPayload<{ select: typeof RECIPE_CARD_SELECT }>;

function toRecipeCard(r: RecipeCardRow): RecipeCard {
  const macros = computeRecipeMacros(r.ingredients.map(toMacroIngredient), num(r.yieldPortions));
  const ingredientNames = r.ingredients.flatMap((i) => [i.label, i.food?.name].filter((s): s is string => !!s));
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    origin: r.origin,
    type: r.type,
    moments: r.moments,
    tags: r.tags,
    portionHousehold: r.portionHousehold,
    perPortion: macros.perPortion,
    macrosIncomplete: macros.freeText.names.length > 0 || macros.missingGrams.names.length > 0,
    photoId: r.photo?.id ?? null,
    draftThumbId: r.status === "DRAFT" && !r.photo ? (r.importImages[0]?.id ?? null) : null,
    sourceName: r.sourceName,
    importFile: r.importFile,
    importPage: r.importPage,
    searchText: recipeSearchText({ name: r.name, ingredientNames, tags: r.tags }),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listRecipeCards(params: { status: RecipeStatusKey }): Promise<RecipeCard[]> {
  const rows = await prisma.recipe.findMany({
    where: { status: params.status },
    select: RECIPE_CARD_SELECT,
    orderBy: { name: "asc" },
  });
  return rows.map(toRecipeCard);
}

export async function countRecipesByStatus(): Promise<Record<RecipeStatusKey, number>> {
  const groups = await prisma.recipe.groupBy({ by: ["status"], _count: { _all: true } });
  const out: Record<RecipeStatusKey, number> = { DRAFT: 0, PUBLISHED: 0, ARCHIVED: 0 };
  for (const g of groups) out[g.status] = g._count._all;
  return out;
}

// ── Detalle ───────────────────────────────────────────────────────────────────────────────────

type RecipePublished = {
  portionText: string | null;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
} | null;

/** Para el editor y la revisión: todo menos bytes. */
export interface RecipeDetail {
  id: string;
  name: string;
  status: RecipeStatusKey;
  origin: "MANUAL" | "IMPORT";
  type: RecipeTypeKey | null;
  moments: RecipeMomentKey[];
  tags: RecipeTagKey[];
  yieldPortions: number | null;
  portionHousehold: string | null;
  portionGrams: number | null;
  preparation: string | null;
  tips: string | null;
  sourceName: string | null;
  published: RecipePublished;
  ingredients: {
    id: string;
    order: number;
    label: string | null;
    grams: number | null;
    noQuantity: boolean;
    household: string | null;
    rawText: string | null;
    food: RecipeCatalogFood | null;
  }[];
  photo: { id: string; credit: string | null } | null;
  import: {
    file: string | null;
    page: number | null;
    rawText: string | null;
    hints: unknown;
    pageImageId: string | null;
    candidateIds: string[];
  } | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

const RECIPE_DETAIL_SELECT = {
  id: true,
  name: true,
  status: true,
  origin: true,
  type: true,
  moments: true,
  tags: true,
  yieldPortions: true,
  portionHousehold: true,
  portionGrams: true,
  preparation: true,
  tips: true,
  sourceName: true,
  publishedPortionText: true,
  publishedKcal: true,
  publishedProteinG: true,
  publishedCarbsG: true,
  publishedFatG: true,
  publishedFiberG: true,
  importFile: true,
  importPage: true,
  importRawText: true,
  importHints: true,
  reviewedAt: true,
  publishedAt: true,
  updatedAt: true,
  ingredients: {
    orderBy: { order: "asc" },
    select: {
      id: true,
      order: true,
      label: true,
      grams: true,
      noQuantity: true,
      household: true,
      rawText: true,
      food: { select: MACRO_FOOD_SELECT },
    },
  },
  photo: { select: { id: true, credit: true } },
  importImages: { orderBy: [{ kind: "asc" }, { order: "asc" }], select: { id: true, kind: true } },
} satisfies Prisma.RecipeSelect;

export async function getRecipe(id: string): Promise<RecipeDetail | null> {
  const r = await prisma.recipe.findUnique({ where: { id }, select: RECIPE_DETAIL_SELECT });
  if (!r) return null;
  const published = [
    r.publishedPortionText,
    r.publishedKcal,
    r.publishedProteinG,
    r.publishedCarbsG,
    r.publishedFatG,
    r.publishedFiberG,
  ].some((v) => v !== null)
    ? {
        portionText: r.publishedPortionText,
        kcal: num(r.publishedKcal),
        protein: num(r.publishedProteinG),
        carbs: num(r.publishedCarbsG),
        fat: num(r.publishedFatG),
        fiber: num(r.publishedFiberG),
      }
    : null;
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    origin: r.origin,
    type: r.type,
    moments: r.moments,
    tags: r.tags,
    yieldPortions: num(r.yieldPortions),
    portionHousehold: r.portionHousehold,
    portionGrams: num(r.portionGrams),
    preparation: r.preparation,
    tips: r.tips,
    sourceName: r.sourceName,
    published,
    ingredients: r.ingredients.map((i) => ({
      id: i.id,
      order: i.order,
      label: i.label,
      grams: num(i.grams),
      noQuantity: i.noQuantity,
      household: i.household,
      rawText: i.rawText,
      food: i.food ? toCatalogFood(i.food) : null,
    })),
    photo: r.photo ? { id: r.photo.id, credit: r.photo.credit } : null,
    import:
      r.origin === "IMPORT"
        ? {
            file: r.importFile,
            page: r.importPage,
            rawText: r.importRawText,
            hints: r.importHints,
            pageImageId: r.importImages.find((x) => x.kind === "PAGE")?.id ?? null,
            candidateIds: r.importImages.filter((x) => x.kind === "CANDIDATE").map((x) => x.id),
          }
        : null,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Catálogo para el editor: activos + los inactivos que use esta receta. Con fibra. */
export async function listFoodsForRecipes(includeIds: readonly string[] = []): Promise<RecipeCatalogFood[]> {
  const rows = await prisma.food.findMany({
    where: includeIds.length > 0 ? { OR: [{ active: true }, { id: { in: [...includeIds] } }] } : { active: true },
    select: MACRO_FOOD_SELECT,
    orderBy: { name: "asc" },
  });
  return rows.map(toCatalogFood);
}

/** Planes y plantillas DISTINTOS con al menos un ítem de esta receta (D10). */
export async function getRecipeUsage(recipeId: string): Promise<{ plans: number; templates: number }> {
  const [plans, templates] = await Promise.all([
    prisma.nutritionPlan.count({ where: { meals: { some: { items: { some: { recipeId } } } } } }),
    prisma.planTemplate.count({ where: { meals: { some: { items: { some: { recipeId } } } } } }),
  ]);
  return { plans, templates };
}

/**
 * HU-018c: lo que necesita un ítem de receta en el plan (getPlan, getTemplate y el portal): macros
 * (con los ingredientes), micronutrientes (nutrients y sodio), nombre, porción, fuente y foto. NO filtra
 * por estado: una receta archivada sigue en el plan con sus macros (D10).
 */
export const RECIPE_ITEM_SELECT = {
  id: true,
  name: true,
  status: true,
  type: true,
  portionHousehold: true,
  yieldPortions: true,
  sourceName: true,
  photo: { select: { id: true } },
  ingredients: {
    orderBy: { order: "asc" },
    select: {
      label: true,
      grams: true,
      noQuantity: true,
      food: {
        select: {
          id: true,
          name: true,
          group: true,
          kcalPer100: true,
          proteinPer100: true,
          carbsPer100: true,
          fatPer100: true,
          fiberPer100: true,
          nutrients: true,
          sodiumMgPer100: true,
        },
      },
    },
  },
} satisfies Prisma.RecipeSelect;

// ── Escritura ─────────────────────────────────────────────────────────────────────────────────

export interface RecipeInput {
  name: string;
  type: RecipeTypeKey | null;
  moments: RecipeMomentKey[];
  tags: RecipeTagKey[];
  yieldPortions: number | null;
  portionHousehold: string | null;
  portionGrams: number | null;
  preparation: string | null;
  tips: string | null;
  sourceName: string | null;
  /** Solo se escribe si origin = IMPORT (en MANUAL se ignora). */
  published: RecipeDetail["published"];
  /** El orden del array es el `order`. */
  ingredients: {
    foodId: string | null;
    label: string | null;
    grams: number | null;
    noQuantity: boolean;
    household: string | null;
    rawText: string | null;
  }[];
}

export class RecipeNotFoundError extends Error {
  constructor() {
    super("La receta no existe.");
    this.name = "RecipeNotFoundError";
  }
}

export class RecipeNotPublishableError extends Error {
  constructor(public readonly issues: RecipePublishIssue[]) {
    super(`Receta incompleta: ${issues.map((i) => i.field).join(", ")}`);
    this.name = "RecipeNotPublishableError";
  }
}

/** Transición de estado inválida (archivar un DRAFT, descartar un PUBLISHED…). */
export class RecipeStatusError extends Error {
  constructor(message = "La receta no está en el estado esperado.") {
    super(message);
    this.name = "RecipeStatusError";
  }
}

/** Borrar con uso > 0. */
export class RecipeInUseError extends Error {
  constructor() {
    super("La receta se usa en planes o plantillas.");
    this.name = "RecipeInUseError";
  }
}

const clean = (s: string | null | undefined): string | null => {
  const t = s?.trim() ?? "";
  return t === "" ? null : t;
};

function ingredientRows(recipeId: string, input: RecipeInput) {
  return input.ingredients.map((i, order) => ({
    recipeId,
    order,
    foodId: i.foodId || null,
    label: clean(i.label),
    grams: i.noQuantity ? null : i.grams,
    noQuantity: i.noQuantity,
    household: clean(i.household),
    rawText: i.rawText,
  }));
}

function recipeData(input: RecipeInput, origin: "MANUAL" | "IMPORT") {
  const pub = origin === "IMPORT" ? input.published : undefined;
  return {
    name: input.name.trim(),
    type: input.type,
    moments: [...new Set(input.moments)],
    tags: [...new Set(input.tags)],
    yieldPortions: input.yieldPortions,
    portionHousehold: clean(input.portionHousehold),
    portionGrams: input.portionGrams,
    preparation: clean(input.preparation),
    tips: clean(input.tips),
    sourceName: clean(input.sourceName),
    ...(pub !== undefined
      ? {
          publishedPortionText: clean(pub?.portionText),
          publishedKcal: pub?.kcal ?? null,
          publishedProteinG: pub?.protein ?? null,
          publishedCarbsG: pub?.carbs ?? null,
          publishedFatG: pub?.fat ?? null,
          publishedFiberG: pub?.fiber ?? null,
        }
      : {}),
  };
}

function assertPublishable(input: RecipeInput, origin: "MANUAL" | "IMPORT"): void {
  const issues = validateRecipeForPublish({ ...input, origin });
  if (issues.length > 0) throw new RecipeNotPublishableError(issues);
}

/** Crea y publica (manual: "Guardar" publica). Si no valida → RecipeNotPublishableError. */
export async function createRecipe(input: RecipeInput): Promise<{ id: string }> {
  assertPublishable(input, "MANUAL");
  return prisma.$transaction(async (tx) => {
    const recipe = await tx.recipe.create({
      data: { ...recipeData(input, "MANUAL"), status: "PUBLISHED", origin: "MANUAL", publishedAt: new Date() },
      select: { id: true },
    });
    if (input.ingredients.length > 0) {
      await tx.recipeIngredient.createMany({ data: ingredientRows(recipe.id, input) });
    }
    return { id: recipe.id };
  });
}

/**
 * Guarda datos e ingredientes en una transacción (borra solo los ingredientes de ESTA receta y los
 * vuelve a crear en orden). PUBLISHED/ARCHIVED: valida. DRAFT: guarda tal cual y marca reviewedAt.
 */
export async function updateRecipe(id: string, input: RecipeInput): Promise<void> {
  const current = await prisma.recipe.findUnique({
    where: { id },
    select: { id: true, status: true, origin: true, reviewedAt: true },
  });
  if (!current) throw new RecipeNotFoundError();
  if (current.status !== "DRAFT") assertPublishable(input, current.origin);
  await prisma.$transaction(async (tx) => {
    await tx.recipe.update({
      where: { id },
      data: {
        ...recipeData(input, current.origin),
        ...(current.status === "DRAFT" && current.reviewedAt === null ? { reviewedAt: new Date() } : {}),
      },
    });
    await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
    if (input.ingredients.length > 0) {
      await tx.recipeIngredient.createMany({ data: ingredientRows(id, input) });
    }
  });
}

/** DRAFT → PUBLISHED (valida), publishedAt = now(), borra sus RecipeImportImage. */
export async function publishRecipe(id: string): Promise<void> {
  const r = await prisma.recipe.findUnique({
    where: { id },
    select: {
      status: true,
      origin: true,
      name: true,
      type: true,
      moments: true,
      yieldPortions: true,
      portionHousehold: true,
      sourceName: true,
      ingredients: { orderBy: { order: "asc" }, select: { foodId: true, label: true, grams: true, noQuantity: true } },
    },
  });
  if (!r) throw new RecipeNotFoundError();
  if (r.status !== "DRAFT") throw new RecipeStatusError("Solo se publica un borrador.");
  const issues = validateRecipeForPublish({
    name: r.name,
    type: r.type,
    moments: r.moments,
    yieldPortions: num(r.yieldPortions),
    portionHousehold: r.portionHousehold,
    origin: r.origin,
    sourceName: r.sourceName,
    ingredients: r.ingredients.map((i) => ({ ...i, grams: num(i.grams) })),
  });
  if (issues.length > 0) throw new RecipeNotPublishableError(issues);
  await prisma.$transaction(async (tx) => {
    await tx.recipe.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    await tx.recipeImportImage.deleteMany({ where: { recipeId: id } });
  });
}

async function transition(id: string, from: RecipeStatusKey, to: RecipeStatusKey): Promise<void> {
  const res = await prisma.recipe.updateMany({ where: { id, status: from }, data: { status: to } });
  if (res.count === 1) return;
  const exists = await prisma.recipe.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new RecipeNotFoundError();
  throw new RecipeStatusError();
}

/** PUBLISHED → ARCHIVED. */
export function archiveRecipe(id: string): Promise<void> {
  return transition(id, "PUBLISHED", "ARCHIVED");
}

/** ARCHIVED → PUBLISHED (sin revalidar: ya era válida). */
export function unarchiveRecipe(id: string): Promise<void> {
  return transition(id, "ARCHIVED", "PUBLISHED");
}

/** Solo DRAFT y uso 0. Cascada: ingredientes, imágenes. */
export async function deleteDraftRecipe(id: string): Promise<void> {
  const r = await prisma.recipe.findUnique({ where: { id }, select: { status: true } });
  if (!r) throw new RecipeNotFoundError();
  if (r.status !== "DRAFT") throw new RecipeStatusError("Solo se descarta un borrador.");
  const usage = await getRecipeUsage(id);
  if (usage.plans + usage.templates > 0) throw new RecipeInUseError();
  await prisma.recipe.delete({ where: { id } });
}

// ── Foto ──────────────────────────────────────────────────────────────────────────────────────

/** Reemplaza la foto: delete + create en transacción (id nuevo = URL nueva). Bytes ya procesados. */
export async function setRecipePhoto(
  recipeId: string,
  photo: { data: Buffer; thumbData: Buffer; byteSize: number; credit: string | null },
): Promise<{ photoId: string }> {
  return prisma.$transaction(async (tx) => {
    await tx.recipePhoto.deleteMany({ where: { recipeId } });
    const created = await tx.recipePhoto.create({
      data: {
        recipeId,
        data: photo.data,
        thumbData: photo.thumbData,
        byteSize: photo.byteSize,
        mimeType: "image/webp",
        credit: clean(photo.credit),
      },
      select: { id: true },
    });
    return { photoId: created.id };
  });
}

export async function setRecipePhotoCredit(recipeId: string, credit: string | null): Promise<void> {
  await prisma.recipePhoto.updateMany({ where: { recipeId }, data: { credit: clean(credit) } });
}

export async function removeRecipePhoto(recipeId: string): Promise<void> {
  await prisma.recipePhoto.deleteMany({ where: { recipeId } });
}

export async function getRecipePhotoBytes(
  photoId: string,
  size: "full" | "thumb",
): Promise<{ data: Buffer; mimeType: string } | null> {
  const row =
    size === "full"
      ? await prisma.recipePhoto.findUnique({ where: { id: photoId }, select: { data: true, mimeType: true } })
      : await prisma.recipePhoto.findUnique({ where: { id: photoId }, select: { thumbData: true, mimeType: true } });
  if (!row) return null;
  const bytes = "data" in row ? row.data : row.thumbData;
  return { data: Buffer.from(bytes), mimeType: row.mimeType };
}

/** Portal (D3/D19): true si el paciente tiene un plan ACTIVE con un ítem de la receta de esa foto. */
export async function patientCanSeeRecipePhoto(patientId: string, photoId: string): Promise<boolean> {
  const found = await prisma.recipePhoto.findFirst({
    where: { id: photoId, recipe: { planItems: { some: { meal: { plan: { patientId, status: "ACTIVE" } } } } } },
    select: { id: true },
  });
  return found !== null;
}
