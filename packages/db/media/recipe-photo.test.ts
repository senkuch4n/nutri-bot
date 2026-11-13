// HU-018a: procesamiento real con sharp sobre imágenes generadas en memoria (sin red ni base).
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { InvalidRecipeImageError, processImportPage, processRecipePhoto } from "./recipe-photo";

async function jpeg(width: number, height: number, withExif = false): Promise<Buffer> {
  let img = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg();
  if (withExif) img = img.withMetadata({ orientation: 1, exif: { IFD0: { Copyright: "Prueba HU-018a" } } });
  return img.toBuffer();
}

describe("processRecipePhoto", () => {
  it("un JPEG de 4000×3000 sale WebP 1200×900 y su miniatura 480×360", async () => {
    const out = await processRecipePhoto(await jpeg(4000, 3000));
    const full = await sharp(out.data).metadata();
    const thumb = await sharp(out.thumbData).metadata();
    expect([full.format, full.width, full.height]).toEqual(["webp", 1200, 900]);
    expect([thumb.format, thumb.width, thumb.height]).toEqual(["webp", 480, 360]);
    expect(out.byteSize).toBe(out.data.length);
    expect([out.width, out.height]).toEqual([1200, 900]);
  });

  it("un PNG con alfa de 500×800 sale contenido (4:3 con bordes transparentes) y conserva el alfa", async () => {
    const png = await sharp({ create: { width: 500, height: 800, channels: 4, background: { r: 0, g: 128, b: 0, alpha: 1 } } })
      .png()
      .toBuffer();
    const out = await processRecipePhoto(png);
    const meta = await sharp(out.data).metadata();
    expect([meta.width, meta.height, meta.hasAlpha]).toEqual([1200, 900, true]);
    // No se recortó: la esquina queda transparente (relleno) y el centro opaco (la imagen entera, escalada).
    const { data, info } = await sharp(out.data).raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
    expect(alphaAt(5, 450)).toBe(0);
    expect(alphaAt(600, 450)).toBe(255);
    expect(alphaAt(600, 2)).toBe(255); // alto completo: 800 → 900, sin cortar arriba
  });

  it("una entrada basura tira InvalidRecipeImageError", async () => {
    await expect(processRecipePhoto(Buffer.from("esto no es una imagen"))).rejects.toBeInstanceOf(InvalidRecipeImageError);
    const truncated = (await jpeg(400, 300)).subarray(0, 200);
    await expect(processRecipePhoto(truncated)).rejects.toBeInstanceOf(InvalidRecipeImageError);
  });

  it("la salida no tiene EXIF", async () => {
    const input = await jpeg(1600, 1200, true);
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const out = await processRecipePhoto(input);
    expect((await sharp(out.data).metadata()).exif).toBeUndefined();
    expect((await sharp(out.thumbData).metadata()).exif).toBeUndefined();
  });
});

describe("processImportPage", () => {
  it("reduce a 1000 px de ancho sin recortar ni agrandar", async () => {
    const big = await sharp({ create: { width: 2000, height: 2800, channels: 3, background: "#fff" } }).png().toBuffer();
    const out = await processImportPage(big);
    expect([out.width, out.height]).toEqual([1000, 1400]);
    const small = await sharp({ create: { width: 600, height: 800, channels: 3, background: "#fff" } }).png().toBuffer();
    expect((await processImportPage(small)).width).toBe(600);
  });
});
