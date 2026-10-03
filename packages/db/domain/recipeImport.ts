import {
  RECIPE_GRAMS_MAX,
  RECIPE_YIELD_MAX,
  isRecipeMomentKey,
  isRecipeTypeKey,
} from "@nutri-bot/core";
import type { RecipeImportDraft } from "@nutri-bot/core/recipe-import";
import { prisma, type Prisma } from "../index";
import { RecipeNotFoundError, setRecipePhoto } from "./recipes";

// HU-018a-2 (SDD 5.2, 8.1): borradores de la carga asistida. El parser no elige alimentos ni inventa
// gramos: los ingredientes entran con foodId null y los gramos que dijo el texto. Ninguna función
// toca recetas PUBLISHED/ARCHIVED ni borradores ya revisados, y nada borra por un filtro amplio.

export interface ImportImageInput {
  kind: "PAGE" | "CANDIDATE";
  order: number;
  data: Buffer;
  thumbData: Buffer | null;
  width: number;
  height: number;
}

export type UpsertDraftOutcome = "created" | "updated" | "skipped-reviewed" | "skipped-not-draft";

/** Número que entra en la columna (o null): DECIMAL(p, s) → máximo (10^(p−s) − 10^−s). */
function fits(value: number | null | undefined, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
}

const cut = (s: string | null | undefined, max: number): string | null => {
  const t = s?.trim() ?? "";
  return t === "" ? null : t.slice(0, max);
};

function draftData(draft: RecipeImportDraft) {
  const pub = draft.published;
  return {
    name: draft.name.trim().slice(0, 120) || "Sin nombre",
    type: isRecipeTypeKey(draft.suggestedType) ? draft.suggestedType : null,
    moments: [...new Set(draft.suggestedMoments.filter(isRecipeMomentKey))],
    yieldPortions: fits(draft.yieldPortions, RECIPE_YIELD_MAX),
    portionHousehold: cut(draft.portionHousehold, 200),
    preparation: cut(draft.preparation, 20000),
    tips: cut(draft.tips, 5000),
    sourceName: cut(draft.suggestedSourceName, 300),
    publishedPortionText: cut(pub?.portionText, 200),
    publishedKcal: fits(pub?.kcal, 99999.99),
    publishedProteinG: fits(pub?.protein, 9999.99),
    publishedCarbsG: fits(pub?.carbs, 9999.99),
    publishedFatG: fits(pub?.fat, 9999.99),
    publishedFiberG: fits(pub?.fiber, 9999.99),
    importFile: draft.file,
    importPage: draft.page,
    importRawText: draft.rawText,
    importHints: draft.hints as unknown as Prisma.InputJsonValue,
  };
}

function ingredientRows(recipeId: string, draft: RecipeImportDraft) {
  return draft.ingredients.map((i, order) => ({
    recipeId,
    order,
    foodId: null,
    label: cut(i.label, 200) ?? cut(i.rawText, 200),
    // D5: solo los gramos que dijo el texto (parseIngredientLine); c.n. no lleva gramos.
    grams: i.noQuantity ? null : fits(i.grams, RECIPE_GRAMS_MAX),
    noQuantity: i.noQuantity,
    household: cut(i.household, 120),
    rawText: cut(i.rawText, 2000),
  }));
}

function imageRows(recipeId: string, images: readonly ImportImageInput[]) {
  return images.map((img) => ({
    recipeId,
    kind: img.kind,
    order: img.order,
    data: img.data,
    thumbData: img.thumbData,
    width: img.width,
    height: img.height,
  }));
}

/**
 * Clave importKey. Si no existe → crea DRAFT (origin IMPORT) con ingredientes e imágenes. Si existe y
 * es DRAFT sin reviewedAt → reemplaza datos, ingredientes e imágenes (images null = deja las que tenía).
 * DRAFT con reviewedAt → "skipped-reviewed". PUBLISHED/ARCHIVED → "skipped-not-draft". Nunca toca otra receta.
 */
export async function upsertImportedDraft(
  draft: RecipeImportDraft,
  images: ImportImageInput[] | null,
): Promise<{ id: string; outcome: UpsertDraftOutcome }> {
  const existing = await prisma.recipe.findUnique({
    where: { importKey: draft.importKey },
    select: { id: true, status: true, reviewedAt: true },
  });
  if (existing && existing.status !== "DRAFT") return { id: existing.id, outcome: "skipped-not-draft" };
  if (existing && existing.reviewedAt !== null) return { id: existing.id, outcome: "skipped-reviewed" };

  if (!existing) {
    return prisma.$transaction(async (tx) => {
      const recipe = await tx.recipe.create({
        data: { ...draftData(draft), importKey: draft.importKey, status: "DRAFT", origin: "IMPORT" },
        select: { id: true },
      });
      const rows = ingredientRows(recipe.id, draft);
      if (rows.length > 0) await tx.recipeIngredient.createMany({ data: rows });
      if (images && images.length > 0) await tx.recipeImportImage.createMany({ data: imageRows(recipe.id, images) });
      return { id: recipe.id, outcome: "created" as const };
    });
  }

  const id = existing.id;
  return prisma.$transaction(async (tx) => {
    // El where repite el estado: si alguien lo revisó entre la lectura y acá, no se pisa.
    const res = await tx.recipe.updateMany({
      where: { id, status: "DRAFT", reviewedAt: null },
      data: draftData(draft),
    });
    if (res.count === 0) return { id, outcome: "skipped-reviewed" as const };
    await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
    const rows = ingredientRows(id, draft);
    if (rows.length > 0) await tx.recipeIngredient.createMany({ data: rows });
    if (images !== null) {
      await tx.recipeImportImage.deleteMany({ where: { recipeId: id } });
      if (images.length > 0) await tx.recipeImportImage.createMany({ data: imageRows(id, images) });
    }
    return { id, outcome: "updated" as const };
  });
}

export interface DraftQueueItem {
  id: string;
  name: string;
  importFile: string | null;
  importPage: number | null;
}

/** Cola de revisión: DRAFT ordenados por importFile, importPage, name. Filtro opcional por archivo. */
export async function listDraftQueue(params?: { file?: string }): Promise<DraftQueueItem[]> {
  return prisma.recipe.findMany({
    where: { status: "DRAFT", ...(params?.file ? { importFile: params.file } : {}) },
    orderBy: [{ importFile: "asc" }, { importPage: "asc" }, { name: "asc" }],
    select: { id: true, name: true, importFile: true, importPage: true },
  });
}

export async function listDraftFiles(): Promise<{ file: string; count: number }[]> {
  const groups = await prisma.recipe.groupBy({
    by: ["importFile"],
    where: { status: "DRAFT", importFile: { not: null } },
    _count: { _all: true },
    orderBy: { importFile: "asc" },
  });
  return groups.flatMap((g) => (g.importFile ? [{ file: g.importFile, count: g._count._all }] : []));
}

/** Bytes de una imagen de la carga asistida (WebP). PAGE no tiene miniatura: devuelve la imagen. */
export async function getImportImageBytes(
  imageId: string,
  size: "full" | "thumb",
): Promise<{ data: Buffer; mimeType: "image/webp" } | null> {
  const row = await prisma.recipeImportImage.findUnique({
    where: { id: imageId },
    select: size === "thumb" ? { thumbData: true, data: true } : { data: true },
  });
  if (!row) return null;
  const thumb = "thumbData" in row ? (row.thumbData as Uint8Array | null) : null;
  const bytes = size === "thumb" && thumb ? thumb : row.data;
  return { data: Buffer.from(bytes), mimeType: "image/webp" };
}

/** Copia la candidata a RecipePhoto (setRecipePhoto con sus bytes ya procesados). */
export async function chooseImportCandidateAsPhoto(
  recipeId: string,
  imageId: string,
  credit: string | null,
): Promise<{ photoId: string }> {
  const img = await prisma.recipeImportImage.findFirst({
    where: { id: imageId, recipeId, kind: "CANDIDATE" },
    select: { data: true, thumbData: true },
  });
  if (!img || !img.thumbData) throw new RecipeNotFoundError();
  const data = Buffer.from(img.data);
  return setRecipePhoto(recipeId, { data, thumbData: Buffer.from(img.thumbData), byteSize: data.length, credit });
}

/** Deshacer una corrida: borra SOLO los ids dados que sigan DRAFT y sin reviewedAt. Devuelve cuántos borró. */
export async function deleteUnreviewedDrafts(ids: readonly string[]): Promise<number> {
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id !== ""))];
  if (unique.length === 0) return 0;
  const res = await prisma.recipe.deleteMany({
    where: { id: { in: unique }, status: "DRAFT", reviewedAt: null },
  });
  return res.count;
}
