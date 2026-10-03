// HU-018a (D18): validación de la foto de una receta antes de procesarla con sharp. Pura.

import { RECIPE_TEXT } from "./recipes";

/** 5 MB inclusive. */
export const RECIPE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export type RecipePhotoMime = "image/jpeg" | "image/png" | "image/webp";

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP"

function matchAt(bytes: Uint8Array, magic: readonly number[], offset = 0): boolean {
  return bytes.length >= offset + magic.length && magic.every((b, i) => bytes[offset + i] === b);
}

/** Magic bytes: JPEG FF D8 FF · PNG 89 50 4E 47 0D 0A 1A 0A · WebP "RIFF" ???? "WEBP". Otro → null. */
export function detectRecipePhotoMime(bytes: Uint8Array): RecipePhotoMime | null {
  if (matchAt(bytes, JPEG)) return "image/jpeg";
  if (matchAt(bytes, PNG)) return "image/png";
  if (matchAt(bytes, RIFF) && matchAt(bytes, WEBP, 8)) return "image/webp";
  return null;
}

/** Pre-chequeo sin leer el archivo (cliente y action). ≤ 0 o > tope → photoInvalid. */
export function recipePhotoSizeError(size: number): string | null {
  if (!Number.isFinite(size) || size <= 0 || size > RECIPE_PHOTO_MAX_BYTES) return RECIPE_TEXT.photoInvalid;
  return null;
}

/** Orden: vacío → tamaño → tipo. */
export function validateRecipePhoto(
  bytes: Uint8Array,
): { ok: true; mimeType: RecipePhotoMime } | { ok: false; error: string } {
  const sizeError = recipePhotoSizeError(bytes.length);
  if (sizeError) return { ok: false, error: sizeError };
  const mimeType = detectRecipePhotoMime(bytes);
  if (!mimeType) return { ok: false, error: RECIPE_TEXT.photoInvalid };
  return { ok: true, mimeType };
}

/** Medidas de lo que se guarda. */
export const RECIPE_PHOTO_SIZES = {
  full: { width: 1200, height: 900 },
  thumb: { width: 480, height: 360 },
} as const;
