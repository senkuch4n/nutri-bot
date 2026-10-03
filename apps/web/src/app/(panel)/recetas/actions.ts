"use server";

import { revalidatePath } from "next/cache";
import { RECIPE_TEXT } from "@nutri-bot/core";
import {
  RecipeNotFoundError,
  RecipeNotPublishableError,
  archiveRecipe,
  createRecipe,
  unarchiveRecipe,
  updateRecipe,
} from "@nutri-bot/db/domain";
import { errorCode } from "@/lib/error-code";
import {
  NOT_FOUND,
  INVALID_PAYLOAD,
  SAVE_ERROR,
  applyPhotoIntent,
  hasPanelSession,
  parsePayload,
  readPhotoIntent,
  toRecipeInput,
  type RecipeActionState,
} from "./recipe-save";

// HU-018a: guardar, archivar y volver a publicar recetas. Los errores se loguean SOLO con
// errorCode(err): el payload puede llevar los bytes de la foto. El esquema del payload y la foto
// viven en recipe-save.ts (los comparte la revisión de borradores, 018a-2).

export type { RecipeActionState, RecipeFormPayload } from "./recipe-save";

function revalidateRecipe(id: string) {
  revalidatePath("/recetas");
  revalidatePath(`/recetas/${id}`);
}

/**
 * FormData: "payload" (JSON de RecipeFormPayload), "photo" (File opcional), "removePhoto" ("1"),
 * "photoCredit" (texto). Con id → updateRecipe; sin id → createRecipe.
 * Foto: tamaño → magic bytes (antes de guardar) → sharp → setRecipePhoto (después de guardar).
 * Si la receta se guardó y la foto falla → { ok:false, photoError, id }.
 */
export async function saveRecipeAction(formData: FormData): Promise<RecipeActionState> {
  if (!(await hasPanelSession())) return { ok: false, error: RECIPE_TEXT.sessionExpired };

  const payload = parsePayload(formData.get("payload"));
  if (!payload) return { ok: false, error: INVALID_PAYLOAD };

  // Foto: se valida antes de guardar la receta para no dejar a medias un envío con un archivo inválido.
  const photo = await readPhotoIntent(formData);
  if (!photo.ok) return { ok: false, photoError: photo.photoError };

  const { id: existingId, input } = toRecipeInput(payload);
  let id: string;
  try {
    if (existingId) {
      await updateRecipe(existingId, input);
      id = existingId;
    } else {
      id = (await createRecipe(input)).id;
    }
  } catch (err) {
    if (err instanceof RecipeNotPublishableError) return { ok: false, issues: err.issues };
    if (err instanceof RecipeNotFoundError) return { ok: false, error: NOT_FOUND };
    console.error("saveRecipeAction: no se pudo guardar", errorCode(err));
    return { ok: false, error: SAVE_ERROR };
  }

  try {
    await applyPhotoIntent(id, photo.photo);
  } catch (err) {
    console.error("saveRecipeAction: no se pudo guardar la foto", errorCode(err));
    revalidateRecipe(id);
    return { ok: false, photoError: RECIPE_TEXT.photoSaveError, id };
  }

  revalidateRecipe(id);
  return { ok: true, id };
}

async function runTransition(
  name: string,
  id: string,
  fn: (id: string) => Promise<void>,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await hasPanelSession())) return { ok: false, error: RECIPE_TEXT.sessionExpired };
  try {
    await fn(id);
  } catch (err) {
    console.error(`${name}: no se pudo cambiar el estado`, errorCode(err));
    return { ok: false, error: err instanceof RecipeNotFoundError ? NOT_FOUND : SAVE_ERROR };
  }
  revalidateRecipe(id);
  return { ok: true };
}

export async function archiveRecipeAction(id: string): Promise<{ ok: boolean; error?: string }> {
  return runTransition("archiveRecipeAction", id, archiveRecipe);
}

export async function unarchiveRecipeAction(id: string): Promise<{ ok: boolean; error?: string }> {
  return runTransition("unarchiveRecipeAction", id, unarchiveRecipe);
}
