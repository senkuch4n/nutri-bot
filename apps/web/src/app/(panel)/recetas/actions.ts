"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  RECIPE_MOMENTS,
  RECIPE_TAGS,
  RECIPE_TEXT,
  RECIPE_TYPES,
  recipePhotoSizeError,
  validateRecipePhoto,
  type RecipePublishIssue,
} from "@nutri-bot/core";
import {
  RecipeNotFoundError,
  RecipeNotPublishableError,
  archiveRecipe,
  createRecipe,
  removeRecipePhoto,
  setRecipePhoto,
  setRecipePhotoCredit,
  unarchiveRecipe,
  updateRecipe,
  type RecipeInput,
} from "@nutri-bot/db/domain";
import { processRecipePhoto } from "@nutri-bot/db/media";
import { auth } from "@/auth";
import { errorCode } from "@/lib/error-code";

// HU-018a: guardar, archivar y volver a publicar recetas. Los errores se loguean SOLO con
// errorCode(err): el payload puede llevar los bytes de la foto.

export type RecipeActionState =
  | { ok: true; id: string }
  | { ok: false; error?: string; issues?: RecipePublishIssue[]; photoError?: string; id?: string };

const SAVE_ERROR = "No se pudo guardar la receta. Probá de nuevo.";
const INVALID_PAYLOAD = "Revisá los datos de la receta.";
const NOT_FOUND = "La receta ya no existe.";

const text = (max: number) => z.string().max(max).nullable();
const amount = (max: number) => z.number().finite().min(0).max(max).nullable();

const payloadSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  name: z.string().max(200),
  type: z.enum(RECIPE_TYPES).nullable(),
  moments: z.array(z.enum(RECIPE_MOMENTS)).max(RECIPE_MOMENTS.length),
  tags: z.array(z.enum(RECIPE_TAGS)).max(RECIPE_TAGS.length),
  yieldPortions: z.number().finite().min(-1).max(100000).nullable(),
  portionHousehold: text(200),
  portionGrams: amount(99999),
  preparation: text(20000),
  tips: text(5000),
  sourceName: text(300),
  published: z
    .object({
      portionText: text(200),
      kcal: amount(99999),
      protein: amount(9999),
      carbs: amount(9999),
      fat: amount(9999),
      fiber: amount(9999),
    })
    .nullable(),
  ingredients: z
    .array(
      z.object({
        foodId: z.string().min(1).max(64).nullable(),
        label: text(200),
        grams: z.number().finite().min(-1).max(1000000).nullable(),
        noQuantity: z.boolean(),
        household: text(120),
        rawText: text(2000),
      }),
    )
    .max(100),
});

export type RecipeFormPayload = z.infer<typeof payloadSchema>;

async function hasPanelSession(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user);
}

function parsePayload(raw: FormDataEntryValue | null): RecipeFormPayload | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

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
  const file = formData.get("photo");
  let photoBytes: Buffer | null = null;
  if (file instanceof File && file.size > 0) {
    if (recipePhotoSizeError(file.size)) return { ok: false, photoError: RECIPE_TEXT.photoInvalid };
    // Se ignoran file.type y file.name: manda el tipo detectado por magic bytes.
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!validateRecipePhoto(bytes).ok) return { ok: false, photoError: RECIPE_TEXT.photoInvalid };
    photoBytes = bytes;
  }
  const removePhoto = formData.get("removePhoto") === "1";
  const creditRaw = formData.get("photoCredit");
  const credit = typeof creditRaw === "string" ? creditRaw.trim().slice(0, 200) || null : undefined;

  const { id: existingId, ...rest } = payload;
  const input: RecipeInput = rest;
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
    if (photoBytes) {
      const processed = await processRecipePhoto(photoBytes);
      await setRecipePhoto(id, {
        data: processed.data,
        thumbData: processed.thumbData,
        byteSize: processed.byteSize,
        credit: credit ?? null,
      });
    } else if (removePhoto) {
      await removeRecipePhoto(id);
    } else if (credit !== undefined) {
      await setRecipePhotoCredit(id, credit);
    }
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
