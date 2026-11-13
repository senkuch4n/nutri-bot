import { describe, expect, it } from "vitest";
import {
  RECIPE_PHOTO_MAX_BYTES,
  detectRecipePhotoMime,
  recipePhotoSizeError,
  validateRecipePhoto,
} from "./recipe-photo";
import { RECIPE_TEXT } from "./recipes";

const bytes = (...head: number[]) => new Uint8Array([...head, 0, 0, 0, 0, 0, 0, 0, 0]);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe("detectRecipePhotoMime", () => {
  it("reconoce JPEG, PNG y WebP por magic bytes", () => {
    expect(detectRecipePhotoMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectRecipePhotoMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(detectRecipePhotoMime(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")))).toBe("image/webp");
  });

  it("un RIFF que no es WebP (WAV) y un GIF dan null", () => {
    expect(detectRecipePhotoMime(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WAVE")))).toBeNull();
    expect(detectRecipePhotoMime(bytes(...ascii("GIF89a")))).toBeNull();
    expect(detectRecipePhotoMime(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});

describe("recipePhotoSizeError", () => {
  it("0 y 5 MB + 1 fallan; 5 MB exacto pasa", () => {
    expect(recipePhotoSizeError(0)).toBe(RECIPE_TEXT.photoInvalid);
    expect(recipePhotoSizeError(RECIPE_PHOTO_MAX_BYTES)).toBeNull();
    expect(recipePhotoSizeError(RECIPE_PHOTO_MAX_BYTES + 1)).toBe(RECIPE_TEXT.photoInvalid);
  });
});

describe("validateRecipePhoto", () => {
  it("vacío → error", () => {
    expect(validateRecipePhoto(new Uint8Array())).toEqual({ ok: false, error: RECIPE_TEXT.photoInvalid });
  });

  it("chequea el tamaño antes que el tipo (un JPEG demasiado grande falla)", () => {
    const big = new Uint8Array(RECIPE_PHOTO_MAX_BYTES + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect(validateRecipePhoto(big)).toEqual({ ok: false, error: RECIPE_TEXT.photoInvalid });
  });

  it("tipo inválido → error; válido → ok con el MIME", () => {
    expect(validateRecipePhoto(bytes(...ascii("GIF89a")))).toEqual({ ok: false, error: RECIPE_TEXT.photoInvalid });
    expect(validateRecipePhoto(bytes(0xff, 0xd8, 0xff))).toEqual({ ok: true, mimeType: "image/jpeg" });
  });
});
