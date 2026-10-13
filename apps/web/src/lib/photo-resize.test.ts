import { describe, expect, it } from "vitest";
import { PHOTO_ATTEMPTS, PHOTO_MAX_BYTES, PHOTO_TARGET_BYTES, canUploadAsIs, fitWithin } from "./photo-resize";

const MB = 1024 * 1024;

describe("fitWithin", () => {
  it("achica una foto apaisada de cámara al lado mayor", () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
  });
  it("achica una foto vertical", () => {
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
  });
  it("no agranda una foto chica", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
  it("nunca da un lado de 0", () => {
    expect(fitWithin(1, 10000, 1600)).toEqual({ width: 1, height: 1600 });
  });
});

describe("canUploadAsIs", () => {
  it("un jpeg de 1 MB a 1200 px se sube como está", () => {
    expect(canUploadAsIs({ type: "image/jpeg", size: 1 * MB }, { width: 1200, height: 900 })).toBe(true);
  });
  it("un jpeg de 2,6 MB se re-codifica", () => {
    expect(canUploadAsIs({ type: "image/jpeg", size: 2.6 * MB }, { width: 1200, height: 900 })).toBe(false);
  });
  it("HEIC siempre se re-codifica", () => {
    expect(canUploadAsIs({ type: "image/heic", size: 0.5 * MB }, { width: 1200, height: 900 })).toBe(false);
  });
  it("un png de 2000 px se re-codifica", () => {
    expect(canUploadAsIs({ type: "image/png", size: 1 * MB }, { width: 2000, height: 1000 })).toBe(false);
  });
});

describe("PHOTO_ATTEMPTS", () => {
  it("arranca en 1600 px con calidad 0.82 y la calidad y el tamaño nunca suben", () => {
    expect(PHOTO_ATTEMPTS[0]).toEqual({ maxSide: 1600, quality: 0.82 });
    for (let i = 1; i < PHOTO_ATTEMPTS.length; i++) {
      expect(PHOTO_ATTEMPTS[i]!.quality).toBeLessThanOrEqual(PHOTO_ATTEMPTS[i - 1]!.quality);
      expect(PHOTO_ATTEMPTS[i]!.maxSide).toBeLessThanOrEqual(PHOTO_ATTEMPTS[i - 1]!.maxSide);
    }
  });
  it("el objetivo deja margen bajo el límite del servidor", () => {
    expect(PHOTO_TARGET_BYTES).toBeLessThan(PHOTO_MAX_BYTES);
    expect(PHOTO_MAX_BYTES).toBe(3 * MB);
  });
});
