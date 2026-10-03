// HU-018a (D18): procesamiento de fotos de recetas con sharp. Export aparte (`@nutri-bot/db/media`)
// para que el bot, que importa `@nutri-bot/db/domain`, no cargue sharp.
// Sin `import "server-only"`: también lo usan los scripts tsx.

import sharp from "sharp";
import { RECIPE_PHOTO_SIZES } from "@nutri-bot/core";

export interface ProcessedRecipeImage {
  data: Buffer;
  thumbData: Buffer;
  byteSize: number;
  width: number;
  height: number;
}

export class InvalidRecipeImageError extends Error {
  constructor(message = "La imagen no se pudo leer.") {
    super(message);
    this.name = "InvalidRecipeImageError";
  }
}

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

async function render(
  input: Buffer,
  size: { width: number; height: number },
  hasAlpha: boolean,
  quality: number,
): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input, { failOn: "error" })
    .rotate() // orientación EXIF; la salida no lleva metadatos (sharp los descarta por defecto)
    .resize(
      size.width,
      size.height,
      hasAlpha
        ? { fit: "contain", background: TRANSPARENT }
        : { fit: "cover", position: sharp.strategy.attention },
    )
    .webp({ quality, alphaQuality: 90 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Foto de receta → WebP 4:3 (1200×900, quality 80) + miniatura (480×360, quality 72), sin EXIF.
 * Con alfa: "contain" sobre transparente (no se recorta). Sin alfa: "cover" con foco por atención.
 * Entradas que sharp no puede leer → InvalidRecipeImageError.
 */
export async function processRecipePhoto(input: Buffer): Promise<ProcessedRecipeImage> {
  let hasAlpha: boolean;
  try {
    const meta = await sharp(input, { failOn: "error" }).metadata();
    if (!meta.format || !meta.width || !meta.height) throw new Error("sin dimensiones");
    hasAlpha = meta.hasAlpha === true;
  } catch {
    throw new InvalidRecipeImageError();
  }
  try {
    const full = await render(input, RECIPE_PHOTO_SIZES.full, hasAlpha, 80);
    const thumb = await render(input, RECIPE_PHOTO_SIZES.thumb, hasAlpha, 72);
    return { data: full.data, thumbData: thumb.data, byteSize: full.data.length, width: full.width, height: full.height };
  } catch {
    throw new InvalidRecipeImageError();
  }
}

/** Página renderizada (pdftoppm PNG) → WebP de hasta 1000 px de ancho, quality 70, sin recorte. */
export async function processImportPage(input: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  try {
    const { data, info } = await sharp(input, { failOn: "error" })
      .resize({ width: 1000, withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new InvalidRecipeImageError();
  }
}
