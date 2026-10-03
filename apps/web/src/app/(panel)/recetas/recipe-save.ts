import { z } from "zod";
import {
  RECIPE_MOMENTS,
  RECIPE_TAGS,
  RECIPE_TEXT,
  RECIPE_TYPES,
  recipePhotoSizeError,
  validateRecipePhoto,
} from "@nutri-bot/core";
import { removeRecipePhoto, setRecipePhoto, setRecipePhotoCredit, type RecipeInput } from "@nutri-bot/db/domain";
import { processRecipePhoto } from "@nutri-bot/db/media";
import { auth } from "@/auth";

// HU-018a: lo que comparten las server actions del editor (recetas/actions.ts) y de la revisión de
// borradores (recetas/revisar/actions.ts): el esquema del payload y la foto. No es un archivo
// "use server" (esos solo pueden exportar funciones async), así que no se puede llamar desde el cliente.

export type RecipeActionState =
  | { ok: true; id: string }
  | { ok: false; error?: string; issues?: import("@nutri-bot/core").RecipePublishIssue[]; photoError?: string; id?: string };

export const SAVE_ERROR = "No se pudo guardar la receta. Probá de nuevo.";
export const INVALID_PAYLOAD = "Revisá los datos de la receta.";
export const NOT_FOUND = "La receta ya no existe.";

const text = (max: number) => z.string().max(max).nullable();
const amount = (max: number) => z.number().finite().min(0).max(max).nullable();

export const payloadSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  name: z.string().max(200),
  type: z.enum(RECIPE_TYPES).nullable(),
  moments: z.array(z.enum(RECIPE_MOMENTS)).max(RECIPE_MOMENTS.length),
  tags: z.array(z.enum(RECIPE_TAGS)).max(RECIPE_TAGS.length),
  // Topes de las columnas (DECIMAL(5,1) y DECIMAL(7,2)): un valor más grande daría un error genérico de la base.
  yieldPortions: z.number().finite().min(-1).max(9999).nullable(),
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
        grams: z.number().finite().min(-1).max(99999).nullable(),
        noQuantity: z.boolean(),
        household: text(120),
        rawText: text(2000),
      }),
    )
    .max(100),
});

export type RecipeFormPayload = z.infer<typeof payloadSchema>;

export async function hasPanelSession(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user);
}

export function parsePayload(raw: FormDataEntryValue | null): RecipeFormPayload | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function toRecipeInput(payload: RecipeFormPayload): { id: string | undefined; input: RecipeInput } {
  const { id, ...rest } = payload;
  return { id, input: rest };
}

export interface PhotoIntent {
  /** Bytes ya validados (tamaño y magic bytes); sharp corre después de guardar la receta. */
  bytes: Buffer | null;
  remove: boolean;
  /** undefined = no vino el campo (no se toca el crédito). */
  credit: string | null | undefined;
}

/**
 * Lee "photo", "removePhoto" y "photoCredit" del FormData. Valida tamaño y magic bytes ANTES de
 * guardar la receta, así un archivo inválido no deja el envío a medias.
 */
export async function readPhotoIntent(formData: FormData): Promise<{ ok: true; photo: PhotoIntent } | { ok: false; photoError: string }> {
  const file = formData.get("photo");
  let bytes: Buffer | null = null;
  if (file instanceof File && file.size > 0) {
    if (recipePhotoSizeError(file.size)) return { ok: false, photoError: RECIPE_TEXT.photoInvalid };
    // Se ignoran file.type y file.name: manda el tipo detectado por magic bytes.
    const buf = Buffer.from(await file.arrayBuffer());
    if (!validateRecipePhoto(buf).ok) return { ok: false, photoError: RECIPE_TEXT.photoInvalid };
    bytes = buf;
  }
  const creditRaw = formData.get("photoCredit");
  return {
    ok: true,
    photo: {
      bytes,
      remove: formData.get("removePhoto") === "1",
      credit: typeof creditRaw === "string" ? creditRaw.trim().slice(0, 200) || null : undefined,
    },
  };
}

/** Aplica la foto pedida a una receta ya guardada: subir (sharp), quitar o solo el crédito. */
export async function applyPhotoIntent(id: string, photo: PhotoIntent): Promise<void> {
  if (photo.bytes) {
    const processed = await processRecipePhoto(photo.bytes);
    await setRecipePhoto(id, {
      data: processed.data,
      thumbData: processed.thumbData,
      byteSize: processed.byteSize,
      credit: photo.credit ?? null,
    });
  } else if (photo.remove) {
    await removeRecipePhoto(id);
  } else if (photo.credit !== undefined) {
    await setRecipePhotoCredit(id, photo.credit);
  }
}
