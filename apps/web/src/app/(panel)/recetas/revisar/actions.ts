"use server";

import { revalidatePath } from "next/cache";
import { RECIPE_TEXT } from "@nutri-bot/core";
import {
  RecipeNotFoundError,
  RecipeNotPublishableError,
  RecipeStatusError,
  recipeReviewForTenant,
  recipesForTenant,
} from "@nutri-bot/db/domain";
import { errorCode } from "@/lib/error-code";
import { requireTenantContext } from "@/lib/tenant-context";
import {
  INVALID_PAYLOAD,
  NOT_FOUND,
  SAVE_ERROR,
  applyPhotoIntent,
  type PhotoIntent,
  parsePayload,
  readPhotoIntent,
  toRecipeInput,
  type RecipeActionState,
} from "../recipe-save";

// HU-018a-2 (SDD 6.2, 7.5): revisión de borradores de la carga asistida. Guardar un borrador NO lo
// publica (marca reviewedAt: la extracción ya no lo pisa). Publicar valida igual que el editor.
// Los errores se loguean solo con errorCode(err).

const NOT_DRAFT = "Este borrador ya no está para revisar.";

function revalidateReview(id: string) {
  revalidatePath("/recetas");
  revalidatePath("/recetas/revisar");
  revalidatePath(`/recetas/revisar/${id}`);
  revalidatePath(`/recetas/${id}`);
}

/** El que sigue a `id` en la cola (filtrada por archivo); si era el último, el primero que quede. */
type Review = ReturnType<typeof recipeReviewForTenant>;
type Recipes = ReturnType<typeof recipesForTenant>;

async function nextInQueue(review: Review, id: string, file: string | null): Promise<string | null> {
  const queue = await review.queue(file ? { file } : undefined);
  const index = queue.findIndex((q) => q.id === id);
  const after = index >= 0 ? queue[index + 1] : undefined;
  if (after) return after.id;
  return queue.find((q) => q.id !== id)?.id ?? null;
}

const queueFile = (formData: FormData): string | null => {
  const raw = formData.get("queueFile");
  return typeof raw === "string" && raw.trim() !== "" ? raw : null;
};

/** Paso común: valida pertenencia, payload y foto, y guarda solo sobre DRAFT. */
async function saveDraft(
  formData: FormData,
  name: string,
): Promise<{ ok: true; id: string; photo: PhotoIntent; recipes: Recipes; review: Review } | { ok: false; state: RecipeActionState }> {
  const access = await requireTenantContext("write").catch(() => null);
  if (!access) return { ok: false, state: { ok: false, error: RECIPE_TEXT.sessionExpired } };
  const recipes = recipesForTenant(access.tenantId);
  const payload = parsePayload(formData.get("payload"));
  const { id, input } = payload ? toRecipeInput(payload) : { id: undefined, input: null };
  if (!payload || !id || !input) return { ok: false, state: { ok: false, error: INVALID_PAYLOAD } };

  const photo = await readPhotoIntent(formData);
  if (!photo.ok) return { ok: false, state: { ok: false, photoError: photo.photoError } };

  try {
    await recipes.updateDraft(id, input);
  } catch (err) {
    if (err instanceof RecipeNotFoundError) return { ok: false, state: { ok: false, error: NOT_FOUND } };
    if (err instanceof RecipeStatusError) return { ok: false, state: { ok: false, error: NOT_DRAFT } };
    console.error(`${name}: no se pudo guardar`, errorCode(err));
    return { ok: false, state: { ok: false, error: SAVE_ERROR } };
  }
  return { ok: true, id, photo: photo.photo, recipes, review: recipeReviewForTenant(access.tenantId) };
}

async function saveDraftPhoto(saved: { id: string; photo: PhotoIntent; recipes: Recipes; review: Review }, formData: FormData) {
  const { id, photo, recipes, review } = saved;
  const candidateId = formData.get("candidateId");
  if (typeof candidateId === "string" && candidateId !== "") {
    await review.chooseCandidate(id, candidateId, photo.credit ?? null);
  } else {
    await applyPhotoIntent(id, photo, recipes);
  }
}

/**
 * Guarda sin publicar (updateRecipe sobre DRAFT; marca reviewedAt). Misma foto que el editor:
 * "photo" (archivo), "removePhoto" o "candidateId" (una de las fotos encontradas).
 */
export async function saveDraftAction(formData: FormData): Promise<RecipeActionState> {
  const saved = await saveDraft(formData, "saveDraftAction");
  if (!saved.ok) return saved.state;
  const { id } = saved;
  try {
    await saveDraftPhoto(saved, formData);
  } catch (err) {
    console.error("saveDraftAction: no se pudo guardar la foto", errorCode(err));
    revalidateReview(id);
    return { ok: false, photoError: RECIPE_TEXT.photoSaveError, id };
  }
  revalidateReview(id);
  return { ok: true, id };
}

/**
 * Guarda + publishRecipe. Si viene "candidateId", chooseImportCandidateAsPhoto ANTES de publicar
 * (publicar borra las imágenes de la carga asistida). Devuelve el id del siguiente borrador de la
 * cola ("queueFile" filtra por recetario), o null si no queda ninguno.
 */
export async function publishDraftAction(formData: FormData): Promise<RecipeActionState & { nextId?: string | null }> {
  const saved = await saveDraft(formData, "publishDraftAction");
  if (!saved.ok) return saved.state;
  const { id, recipes, review } = saved;

  try {
    await saveDraftPhoto(saved, formData);
  } catch (err) {
    console.error("publishDraftAction: no se pudo guardar la foto", errorCode(err));
    revalidateReview(id);
    return { ok: false, photoError: RECIPE_TEXT.photoSaveError, id };
  }

  // La cola se lee antes de publicar, para saber cuál venía después de este.
  const nextId = await nextInQueue(review, id, queueFile(formData));
  try {
    await recipes.publishDraft(id);
  } catch (err) {
    revalidateReview(id);
    if (err instanceof RecipeNotPublishableError) return { ok: false, issues: err.issues, id };
    if (err instanceof RecipeNotFoundError) return { ok: false, error: NOT_FOUND };
    if (err instanceof RecipeStatusError) return { ok: false, error: NOT_DRAFT };
    console.error("publishDraftAction: no se pudo publicar", errorCode(err));
    return { ok: false, error: SAVE_ERROR, id };
  }
  revalidateReview(id);
  return { ok: true, id, nextId };
}

/** Descarta (borra) un borrador. Devuelve el siguiente de la cola (filtrada por `file` si viene). */
export async function discardDraftAction(
  id: string,
  file?: string | null,
): Promise<{ ok: boolean; nextId: string | null; error?: string }> {
  const access = await requireTenantContext("write").catch(() => null);
  if (!access) return { ok: false, nextId: null, error: RECIPE_TEXT.sessionExpired };
  const nextId = await nextInQueue(recipeReviewForTenant(access.tenantId), id, file ?? null);
  try {
    await recipesForTenant(access.tenantId).discardDraft(id);
  } catch (err) {
    if (err instanceof RecipeNotFoundError) return { ok: false, nextId: null, error: NOT_FOUND };
    if (err instanceof RecipeStatusError) return { ok: false, nextId, error: NOT_DRAFT };
    console.error("discardDraftAction: no se pudo descartar", errorCode(err));
    return { ok: false, nextId: null, error: SAVE_ERROR };
  }
  revalidateReview(id);
  return { ok: true, nextId };
}
