import {
  computeRecipeMacros,
  ingredientDisplayName,
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
import { FOOD_REFERENCE_UNAVAILABLE, unavailableFoodReferences } from "./foodReferenceOwnership";
import type { TenantRef } from "./tenantScope";

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

export function listRecipeCards(params: { status: RecipeStatusKey }): Promise<RecipeCard[]> {
  return readRecipeCards({ status: params.status });
}

async function readRecipeCards(where: Prisma.RecipeWhereInput): Promise<RecipeCard[]> {
  const rows = await prisma.recipe.findMany({
    where,
    select: RECIPE_CARD_SELECT,
    orderBy: { name: "asc" },
  });
  return rows.map(toRecipeCard);
}

export function countRecipesByStatus(): Promise<Record<RecipeStatusKey, number>> {
  return countRecipeStatuses();
}

async function countRecipeStatuses(where?: Prisma.RecipeWhereInput): Promise<Record<RecipeStatusKey, number>> {
  const groups = await prisma.recipe.groupBy({ ...(where ? { where } : {}), by: ["status"], _count: { _all: true } });
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

export function getRecipe(id: string): Promise<RecipeDetail | null> {
  return readRecipe({ id });
}

async function readRecipe(where: Prisma.RecipeWhereUniqueInput): Promise<RecipeDetail | null> {
  const r = await prisma.recipe.findUnique({ where, select: RECIPE_DETAIL_SELECT });
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
  return readFoodsForRecipes(includeIds);
}

async function readFoodsForRecipes(includeIds: readonly string[], tenantId?: string): Promise<RecipeCatalogFood[]> {
  const activeOrIncluded = includeIds.length > 0 ? { OR: [{ active: true }, { id: { in: [...includeIds] } }] } : { active: true };
  const rows = await prisma.food.findMany({
    where: tenantId === undefined ? activeOrIncluded : {
      AND: [activeOrIncluded, { OR: [{ source: "SARA2" }, { source: "PROPIO", tenantId }] }],
    },
    select: MACRO_FOOD_SELECT,
    orderBy: { name: "asc" },
  });
  return rows.map(toCatalogFood);
}

/** Planes y plantillas DISTINTOS con al menos un ítem de esta receta (D10). */
export async function getRecipeUsage(recipeId: string): Promise<{ plans: number; templates: number }> {
  return countRecipeUsage(recipeId);
}

async function countRecipeUsage(recipeId: string, tenantId?: string): Promise<{ plans: number; templates: number }> {
  const where = { ...(tenantId === undefined ? {} : { tenantId }), meals: { some: { items: { some: { recipeId } } } } };
  const [plans, templates] = await Promise.all([
    prisma.nutritionPlan.count({ where }),
    prisma.planTemplate.count({ where }),
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

// ── Detalle de lectura (HU-018c-2) ────────────────────────────────────────────────────────────

/**
 * Detalle para el buscador (diálogo) y el portal. Serializable. Sin bytes ni datos de importación
 * (`importRawText`, `rawText`, `importHints` y `published*` son de revisión, no para el paciente).
 */
export interface RecipePreview {
  id: string;
  name: string;
  status: RecipeStatusKey;
  type: RecipeTypeKey | null;
  portionHousehold: string | null;
  yieldPortions: number | null;
  perPortion: Macros | null;
  macrosIncomplete: boolean;
  photo: { id: string; credit: string | null } | null;
  sourceName: string | null;
  preparation: string | null;
  tips: string | null;
  /** name = ingredientDisplayName(label, food) */
  ingredients: { name: string; household: string | null; grams: number | null; noQuantity: boolean }[];
}

const RECIPE_PREVIEW_SELECT = {
  id: true,
  name: true,
  status: true,
  type: true,
  portionHousehold: true,
  yieldPortions: true,
  sourceName: true,
  preparation: true,
  tips: true,
  photo: { select: { id: true, credit: true } },
  ingredients: {
    orderBy: { order: "asc" },
    select: { label: true, grams: true, noQuantity: true, household: true, food: { select: MACRO_FOOD_SELECT } },
  },
} satisfies Prisma.RecipeSelect;

type RecipePreviewRow = Prisma.RecipeGetPayload<{ select: typeof RECIPE_PREVIEW_SELECT }>;

function toRecipePreview(r: RecipePreviewRow): RecipePreview {
  const macros = computeRecipeMacros(r.ingredients.map(toMacroIngredient), num(r.yieldPortions));
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    type: r.type,
    portionHousehold: r.portionHousehold,
    yieldPortions: num(r.yieldPortions),
    perPortion: macros.perPortion,
    macrosIncomplete: macros.freeText.names.length > 0 || macros.missingGrams.names.length > 0,
    photo: r.photo ? { id: r.photo.id, credit: r.photo.credit } : null,
    sourceName: r.sourceName,
    preparation: r.preparation,
    tips: r.tips,
    ingredients: r.ingredients.map((i) => ({
      name: ingredientDisplayName(i),
      household: i.household,
      grams: num(i.grams),
      noQuantity: i.noQuantity,
    })),
  };
}

/** PUBLISHED o ARCHIVED. Un borrador (o una receta que no existe) da null: no se muestra. */
export async function getRecipePreview(recipeId: string, tenantId?: string): Promise<RecipePreview | null> {
  const r = await prisma.recipe.findFirst({
    where: { id: recipeId, status: { not: "DRAFT" }, ...(tenantId !== undefined && { tenantId }) },
    select: RECIPE_PREVIEW_SELECT,
  });
  return r ? toRecipePreview(r) : null;
}

/** Las recetas DISTINTAS usadas en ítems del plan (cualquier estado salvo DRAFT), en orden de nombre. */
/** HU-025b-1: recetas del consultorio usadas en un plan del consultorio (`t`). */
export async function listPlanRecipePreviews(t: TenantRef, planId: string): Promise<RecipePreview[]> {
  const { tenantId } = t;
  const rows = await prisma.recipe.findMany({
    where: {
      tenantId,
      status: { not: "DRAFT" },
      planItems: { some: { meal: { planId, plan: { tenantId, patient: { tenantId } } } } },
    },
    select: RECIPE_PREVIEW_SELECT,
    orderBy: { name: "asc" },
  });
  return rows.map(toRecipePreview);
}

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

async function assertRecipeFoodReferences(
  tx: Prisma.TransactionClient,
  tenantId: string,
  ingredients: readonly { foodId: string | null }[],
): Promise<void> {
  const unavailable = await unavailableFoodReferences(tx, tenantId, ingredients.flatMap(({ foodId }) => foodId ? [foodId] : []));
  if (unavailable.size === 0) return;
  throw new RecipeNotPublishableError(ingredients.flatMap(({ foodId }, index) =>
    foodId && unavailable.has(foodId) ? [{ field: "ingredient", index, message: FOOD_REFERENCE_UNAVAILABLE }] : [],
  ));
}

/** Crea y publica (manual: "Guardar" publica). Si no valida → RecipeNotPublishableError. */
export function createRecipe(input: RecipeInput): Promise<{ id: string }> {
  return insertRecipe(input);
}

async function insertRecipe(input: RecipeInput, tenantId?: string): Promise<{ id: string }> {
  assertPublishable(input, "MANUAL");
  return prisma.$transaction(async (tx) => {
    if (tenantId !== undefined) await assertRecipeFoodReferences(tx, tenantId, input.ingredients);
    const recipe = await tx.recipe.create({
      data: {
        ...recipeData(input, "MANUAL"), ...(tenantId === undefined ? {} : { tenantId }),
        status: "PUBLISHED", origin: "MANUAL", publishedAt: new Date(),
      },
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
export function updateRecipe(id: string, input: RecipeInput): Promise<void> {
  return writeRecipe(id, input);
}

async function writeRecipe(id: string, input: RecipeInput, tenantId?: string, draftOnly = false): Promise<void> {
  const where = tenantId === undefined ? { id } : { id, tenantId };
  const current = await prisma.recipe.findUnique({
    where,
    select: { id: true, status: true, origin: true, reviewedAt: true },
  });
  if (!current) throw new RecipeNotFoundError();
  if (draftOnly && current.status !== "DRAFT") throw new RecipeStatusError();
  if (current.status !== "DRAFT") assertPublishable(input, current.origin);
  await prisma.$transaction(async (tx) => {
    if (tenantId !== undefined) await assertRecipeFoodReferences(tx, tenantId, input.ingredients);
    const data = {
      ...recipeData(input, current.origin),
      ...(current.status === "DRAFT" && current.reviewedAt === null ? { reviewedAt: new Date() } : {}),
    };
    if (tenantId === undefined) {
      await tx.recipe.update({ where, data });
    } else {
      // The guarded parent write must succeed in this transaction before replacing its ingredients.
      const result = await tx.recipe.updateMany({ where: draftOnly ? { ...where, status: "DRAFT" } : where, data });
      if (result.count !== 1) {
        if (draftOnly) await rejectDraftWrite(tx, where);
        throw new RecipeNotFoundError();
      }
    }
    await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
    if (input.ingredients.length > 0) {
      await tx.recipeIngredient.createMany({ data: ingredientRows(id, input) });
    }
  });
}

/** DRAFT → PUBLISHED (valida), publishedAt = now(), borra sus RecipeImportImage. */
export function publishRecipe(id: string): Promise<void> {
  return publishDraft(id);
}

async function publishDraft(id: string, tenantId?: string): Promise<void> {
  const where = tenantId === undefined ? { id } : { id, tenantId };
  const validateDraft = async (db: Prisma.TransactionClient) => {
    const r = await db.recipe.findUnique({
      where,
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
    if (tenantId !== undefined) await assertRecipeFoodReferences(db, tenantId, r.ingredients);
  };
  const publish = async (tx: Prisma.TransactionClient) => {
    const data = { status: "PUBLISHED", publishedAt: new Date() } as const;
    if (tenantId === undefined) {
      await tx.recipe.update({ where, data });
    } else {
      const result = await tx.recipe.updateMany({ where: { ...where, status: "DRAFT" }, data });
      if (result.count !== 1) await rejectDraftWrite(tx, where);
    }
    await tx.recipeImportImage.deleteMany({ where: { recipeId: id, ...(tenantId === undefined ? {} : { recipe: { tenantId } }) } });
  };
  if (tenantId === undefined) {
    await validateDraft(prisma);
    await prisma.$transaction(publish);
  } else {
    // Draft edits also write the parent; a concurrent edit cannot replace the validated snapshot.
    await prisma.$transaction(async (tx) => {
      await validateDraft(tx);
      await publish(tx);
    }, { isolationLevel: "Serializable" });
  }
}

async function transition(id: string, from: RecipeStatusKey, to: RecipeStatusKey, tenantId?: string): Promise<void> {
  const where = tenantId === undefined ? { id } : { id, tenantId };
  const res = await prisma.recipe.updateMany({ where: { ...where, status: from }, data: { status: to } });
  if (res.count === 1) return;
  const exists = await prisma.recipe.findUnique({ where, select: { id: true } });
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

async function rejectDraftWrite(db: Prisma.TransactionClient, where: Prisma.RecipeWhereUniqueInput): Promise<never> {
  const existing = await db.recipe.findUnique({ where, select: { id: true } });
  if (!existing) throw new RecipeNotFoundError();
  throw new RecipeStatusError();
}

/** Panel access. The tenant must come from the server's authorized membership. */
export function recipesForTenant(tenantId: string) {
  if (!tenantId) throw new Error("Se requiere el consultorio de la receta.");
  return {
    list: (status: RecipeStatusKey) => readRecipeCards({ tenantId, status }),
    counts: () => countRecipeStatuses({ tenantId }),
    get: (id: string) => readRecipe({ id, tenantId }),
    foods: (includeIds: readonly string[] = []) => readFoodsForRecipes(includeIds, tenantId),
    usage: (id: string) => countRecipeUsage(id, tenantId),
    create: (input: RecipeInput) => insertRecipe(input, tenantId),
    update: (id: string, input: RecipeInput) => writeRecipe(id, input, tenantId),
    updateDraft: (id: string, input: RecipeInput) => writeRecipe(id, input, tenantId, true),
    publishDraft: (id: string) => publishDraft(id, tenantId),
    discardDraft: (id: string) => discardDraft(id, tenantId),
    archive: (id: string) => transition(id, "PUBLISHED", "ARCHIVED", tenantId),
    unarchive: (id: string) => transition(id, "ARCHIVED", "PUBLISHED", tenantId),
    getPhotoBytes: (id: string, size: "full" | "thumb") => readRecipePhotoBytes({ id, recipe: { tenantId } }, size),
    setPhoto: (id: string, photo: RecipePhotoInput) => replaceRecipePhoto(id, photo, tenantId),
    setPhotoCredit: (id: string, credit: string | null) => writeRecipePhotoCredit(photoWhere(id, tenantId), credit),
    removePhoto: (id: string) => deleteRecipePhoto(photoWhere(id, tenantId)),
  };
}

/** Solo DRAFT y uso 0. Cascada: ingredientes, imágenes. */
export function deleteDraftRecipe(id: string): Promise<void> {
  return discardDraft(id);
}

async function discardDraft(id: string, tenantId?: string): Promise<void> {
  const where = tenantId === undefined ? { id } : { id, tenantId };
  assertDiscardableDraft(await prisma.recipe.findUnique({ where, select: { status: true } }));
  if (tenantId === undefined) {
    const usage = await getRecipeUsage(id);
    if (usage.plans + usage.templates > 0) throw new RecipeInUseError();
    await prisma.recipe.delete({ where });
    return;
  }
  // Guard the cascade and preserve the existing restriction even for legacy cross-owner links.
  const result = await prisma.recipe.deleteMany({
    where: { ...where, status: "DRAFT", planItems: { none: {} }, templateItems: { none: {} } },
  });
  if (result.count === 1) return;
  assertDiscardableDraft(await prisma.recipe.findUnique({ where, select: { status: true } }));
  throw new RecipeInUseError();
}

function assertDiscardableDraft(recipe: { status: RecipeStatusKey } | null): void {
  if (!recipe) throw new RecipeNotFoundError();
  if (recipe.status !== "DRAFT") throw new RecipeStatusError("Solo se descarta un borrador.");
}

// ── Foto ──────────────────────────────────────────────────────────────────────────────────────

type RecipePhotoInput = { data: Buffer; thumbData: Buffer; byteSize: number; credit: string | null };

function photoWhere(recipeId: string, tenantId?: string): Prisma.RecipePhotoWhereInput {
  return tenantId === undefined ? { recipeId } : { recipeId, recipe: { tenantId } };
}

/** Legacy import/script writer. Panel writes use recipesForTenant. */
export function setRecipePhoto(recipeId: string, photo: RecipePhotoInput): Promise<{ photoId: string }> {
  return replaceRecipePhoto(recipeId, photo);
}

/** Delete + create in one transaction (new photo ID and URL). Uses already processed bytes. */
async function replaceRecipePhoto(recipeId: string, photo: RecipePhotoInput, tenantId?: string): Promise<{ photoId: string }> {
  return prisma.$transaction(async (tx) => {
    if (tenantId !== undefined) {
      // The child insert cannot filter by owner: lock the matching parent through the insert.
      const owners = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Recipe" WHERE id = ${recipeId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      if (owners.length === 0) throw new RecipeNotFoundError();
    }
    await tx.recipePhoto.deleteMany({ where: photoWhere(recipeId, tenantId) });
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

export function setRecipePhotoCredit(recipeId: string, credit: string | null): Promise<void> {
  return writeRecipePhotoCredit(photoWhere(recipeId), credit);
}

async function writeRecipePhotoCredit(where: Prisma.RecipePhotoWhereInput, credit: string | null): Promise<void> {
  await prisma.recipePhoto.updateMany({ where, data: { credit: clean(credit) } });
}

export function removeRecipePhoto(recipeId: string): Promise<void> {
  return deleteRecipePhoto(photoWhere(recipeId));
}

async function deleteRecipePhoto(where: Prisma.RecipePhotoWhereInput): Promise<void> {
  await prisma.recipePhoto.deleteMany({ where });
}

/** Portal callers must first authorize the patient through their active plan. */
export function getRecipePhotoBytes(photoId: string, size: "full" | "thumb") {
  return readRecipePhotoBytes({ id: photoId }, size);
}

async function readRecipePhotoBytes(
  where: Prisma.RecipePhotoWhereUniqueInput,
  size: "full" | "thumb",
): Promise<{ data: Buffer; mimeType: string } | null> {
  const row =
    size === "full"
      ? await prisma.recipePhoto.findUnique({ where, select: { data: true, mimeType: true } })
      : await prisma.recipePhoto.findUnique({ where, select: { thumbData: true, mimeType: true } });
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
