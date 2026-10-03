import { describe, expect, it } from "vitest";
import { compositeOver, contrastRatio, relativeLuminance } from "./contrast";

describe("contrast", () => {
  it("blanco sobre negro es 21:1 y blanco sobre blanco 1:1", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 2);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("es simétrico", () => {
    expect(contrastRatio("#0066CC", "#F5F5F7")).toBeCloseTo(contrastRatio("#F5F5F7", "#0066CC"), 10);
  });

  it("el tint #0066CC sobre blanco da ≈ 5,57", () => {
    expect(contrastRatio("#0066CC", "#FFFFFF")).toBeCloseTo(5.57, 2);
  });

  it("luminancia en los extremos", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 10);
  });

  it("compone con alpha como el navegador", () => {
    expect(compositeOver("#FFFFFF", 0.8, "#000000")).toBe("#CCCCCC");
    expect(compositeOver("#FFFFFF", 0.85, "#000000")).toBe("#D9D9D9");
    expect(compositeOver("#000000", 0, "#0066CC")).toBe("#0066CC");
  });

  it("acepta minúsculas, sin # y abreviado", () => {
    expect(contrastRatio("0066cc", "#ffffff")).toBeCloseTo(5.57, 2);
    expect(contrastRatio("#fff", "000")).toBeCloseTo(21, 2);
  });

  it("rechaza hex inválidos", () => {
    expect(() => relativeLuminance("#12")).toThrow();
  });
});
