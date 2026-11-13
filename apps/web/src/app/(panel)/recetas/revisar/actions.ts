"use server";

import { revalidatePath } from "next/cache";
import { RECIPE_TEXT } from "@nutri-bot/core";
import {
  RecipeNotFoundError,
  RecipeNotPublishableError,
  RecipeStatusError,
  chooseImportCandidateAsPhoto,
  deleteDraftRecipe,
  listDraftQueue,
  publishRecipe,
  updateRecipe,
} from "@nutri-bot/db/domain";
import { errorCode } from "@/lib/error-code";
import {
  INVALID_PAYLOAD,
  NOT_FOUND,
  SAVE_ERROR,
  applyPhotoIntent,
  hasPanelSession,
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
async function nextInQueue(id: string, file: string | null): Promise<string | null> {
  const queue = await listDraftQueue(file ? { file } : undefined);
  const index = queue.findIndex((q) => q.id === id);
  const after = index >= 0 ? queue[index + 1] : undefined;
  if (after) return after.id;
  return queue.find((q) => q.id !== id)?.id ?? null;
}

const queueFile = (formData: FormData): string | null => {
  const raw = formData.get("queueFile");
  return typeof raw === "string" && raw.trim() !== "" ? raw : null;
};

/** Paso común: valida sesión, payload y foto, y guarda el borrador (updateRecipe sobre DRAFT). */
async function saveDraft(
  formData: FormData,
  name: string,
): Promise<{ ok: true; id: string; photo: Awaited<ReturnType<typeof readPhotoIntent>> & { ok: true } } | { ok: false; state: RecipeActionState }> {
  if (!(await hasPanelSession())) return { ok: false, state: { ok: false, error: RECIPE_TEXT.sessionExpired } };
  const payload = parsePayload(formData.get("payload"));
  const { id, input } = payload ? toRecipeInput(payload) : { id: undefined, input: null };
  if (!payload || !id || !input) return { ok: false, state: { ok: false, error: INVALID_PAYLOAD } };

  const photo = await readPhotoIntent(formData);
  if (!photo.ok) return { ok: false, state: { ok: false, photoError: photo.photoError } };

  try {
    await updateRecipe(id, input);
  } catch (err) {
    if (err instanceof RecipeNotFoundError) return { ok: false, state: { ok: false, error: NOT_FOUND } };
    if (err instanceof RecipeNotPublishableError) return { ok: false, state: { ok: false, error: NOT_DRAFT } };
    console.error(`${name}: no se pudo guardar`, errorCode(err));
    return { ok: false, state: { ok: false, error: SAVE_ERROR } };
  }
  return { ok: true, id, photo };
}

/**
 * Guarda sin publicar (updateRecipe sobre DRAFT; marca reviewedAt). Misma foto que el editor:
 * "photo" (archivo), "removePhoto" o "candidateId" (una de las fotos encontradas).
 */
export async function saveDraftAction(formData: FormData): Promise<RecipeActionState> {
  const saved = await saveDraft(formData, "saveDraftAction");
  if (!saved.ok) return saved.state;
  const { id, photo } = saved;
  try {
    const candidateId = formData.get("candidateId");
    if (typeof candidateId === "string" && candidateId !== "") {
      await chooseImportCandidateAsPhoto(id, candidateId, photo.photo.credit ?? null);
    } else {
      await applyPhotoIntent(id, photo.photo);
    }
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
  const { id, photo } = saved;

  try {
    const candidateId = formData.get("candidateId");
    if (typeof candidateId === "string" && candidateId !== "") {
      await chooseImportCandidateAsPhoto(id, candidateId, photo.photo.credit ?? null);
    } else {
      await applyPhotoIntent(id, photo.photo);
    }
  } catch (err) {
    console.error("publishDraftAction: no se pudo guardar la foto", errorCode(err));
    revalidateReview(id);
    return { ok: false, photoError: RECIPE_TEXT.photoSaveError, id };
  }

  // La cola se lee antes de publicar, para saber cuál venía después de este.
  const nextId = await nextInQueue(id, queueFile(formData));
  try {
    await publishRecipe(id);
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
  if (!(await hasPanelSession())) return { ok: false, nextId: null, error: RECIPE_TEXT.sessionExpired };
  const nextId = await nextInQueue(id, file ?? null);
  try {
    await deleteDraftRecipe(id);
  } catch (err) {
    if (err instanceof RecipeNotFoundError) return { ok: false, nextId, error: NOT_FOUND };
    if (err instanceof RecipeStatusError) return { ok: false, nextId, error: NOT_DRAFT };
    console.error("discardDraftAction: no se pudo descartar", errorCode(err));
    return { ok: false, nextId: null, error: SAVE_ERROR };
  }
  revalidateReview(id);
  return { ok: true, nextId };
}
