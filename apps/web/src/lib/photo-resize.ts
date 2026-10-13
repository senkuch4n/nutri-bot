// HU-017d-2 (SDD 4.3, D10): la foto del diario se achica en el celular antes de subirla, así una foto
// de cámara de 5 MB entra en el límite del servidor (3 MB) sin cambiarlo. La parte pura (medidas y
// cuándo no hace falta re-codificar) tiene test; la que usa el navegador (canvas) se prueba en runtime.

export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_MAX_BYTES = 3 * 1024 * 1024; // igual al límite del servidor
export const PHOTO_TARGET_BYTES = 2.5 * 1024 * 1024; // margen
export const PHOTO_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Escala para que el lado mayor sea ≤ maxSide, sin agrandar; redondea a enteros ≥ 1. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** No hace falta re-codificar si el tipo es permitido, pesa ≤ PHOTO_TARGET_BYTES y el lado mayor ≤ maxSide. */
export function canUploadAsIs(file: { type: string; size: number }, dims: { width: number; height: number }): boolean {
  return (
    (PHOTO_ALLOWED_TYPES as readonly string[]).includes(file.type) &&
    file.size <= PHOTO_TARGET_BYTES &&
    Math.max(dims.width, dims.height) <= PHOTO_MAX_SIDE
  );
}

/** Intentos en orden hasta quedar ≤ PHOTO_TARGET_BYTES: [1600 px, q 0.82], [1600, 0.7], [1280, 0.7], [1024, 0.6]. */
export const PHOTO_ATTEMPTS: readonly { maxSide: number; quality: number }[] = [
  { maxSide: 1600, quality: 0.82 },
  { maxSide: 1600, quality: 0.7 },
  { maxSide: 1280, quality: 0.7 },
  { maxSide: 1024, quality: 0.6 },
];

export type ResizeResult =
  | { ok: true; file: File } // "foto.jpg" (o el original si canUploadAsIs)
  | { ok: false; reason: "unreadable" | "too_large" };

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decodeWithBitmap(file: File): Promise<Decoded | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    return null;
  }
}

async function decodeWithImage(file: File): Promise<Decoded | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) {
      URL.revokeObjectURL(url);
      return null;
    }
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

function encodeJpeg(decoded: Decoded, width: number, height: number, quality: number): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  // JPEG no tiene transparencia: un PNG con fondo transparente queda sobre blanco, no sobre negro.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(decoded.source, 0, 0, width, height);
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
    } catch {
      resolve(null);
    }
  });
}

/** Decodifica con createImageBitmap(file, { imageOrientation: "from-image" }) (respeta EXIF); si no
 *  existe o falla, con <img> + decode() (los navegadores aplican EXIF en <img>). Dibuja en un canvas
 *  con el tamaño de fitWithin, toBlob("image/jpeg", q). HEIC en un navegador que no lo decodifica →
 *  "unreadable". Nunca tira. */
export async function resizePhotoForUpload(file: File): Promise<ResizeResult> {
  let decoded: Decoded | null = null;
  try {
    decoded = (await decodeWithBitmap(file)) ?? (await decodeWithImage(file));
    if (!decoded) return { ok: false, reason: "unreadable" };
    if (canUploadAsIs(file, decoded)) return { ok: true, file };
    for (const attempt of PHOTO_ATTEMPTS) {
      const size = fitWithin(decoded.width, decoded.height, attempt.maxSide);
      const blob = await encodeJpeg(decoded, size.width, size.height, attempt.quality);
      if (!blob) return { ok: false, reason: "unreadable" };
      if (blob.size <= PHOTO_TARGET_BYTES) {
        return { ok: true, file: new File([blob], "foto.jpg", { type: "image/jpeg", lastModified: Date.now() }) };
      }
    }
    return { ok: false, reason: "too_large" };
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    decoded?.release();
  }
}
