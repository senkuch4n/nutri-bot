import { describe, expect, it } from "vitest";
import type { IsakMeasureKey } from "./isak";
import { CASE_A } from "./isak-fixtures.test-data";
import { ISAK_FORM_TEXT, parseIsakNumber, validateIsakForm } from "./isak-form";

type Raw = Partial<Record<IsakMeasureKey, string>>;

/** Caso A como strings, con coma decimal como lo tipea la profesional. */
const rawA: Raw = Object.fromEntries(
  Object.entries(CASE_A).map(([k, v]) => [k, v === null ? "" : String(v).replace(".", ",")]),
);

const errorsOf = (raw: Raw) => {
  const r = validateIsakForm(raw);
  if (r.ok) throw new Error("esperaba errores");
  return r.errors;
};

describe("parseIsakNumber", () => {
  it.each([
    ["11", 11],
    ["11,5", 11.5],
    ["11.5", 11.5],
    [" 6 ", 6],
    ["", null],
    ["   ", null],
    ["11,55", undefined],
    ["abc", undefined],
    ["-3", undefined],
    ["1.234", undefined],
  ])("%j → %j", (raw, expected) => {
    expect(parseIsakNumber(raw)).toBe(expected);
  });

  it("undefined y null → null", () => {
    expect(parseIsakNumber(undefined)).toBeNull();
    expect(parseIsakNumber(null)).toBeNull();
  });
});

describe("validateIsakForm", () => {
  it("caso A completo → ok con los números", () => {
    const r = validateIsakForm(rawA);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.measures).toEqual(CASE_A);
  });

  it("masa y talla obligatorias", () => {
    expect(errorsOf({ ...rawA, heightCm: "" }).heightCm).toBe("La talla es obligatoria para el estudio ISAK");
    expect(errorsOf({ ...rawA, weightKg: "" }).weightKg).toBe("La masa corporal es obligatoria para el estudio ISAK");
  });

  it("rangos (inclusivos)", () => {
    expect(errorsOf({ ...rawA, tricepsSkinfoldMm: "110" }).tricepsSkinfoldMm).toBe(
      "Revisá el valor: los pliegues van de 1 a 80 mm",
    );
    expect(validateIsakForm({ ...rawA, tricepsSkinfoldMm: "80" }).ok).toBe(true);
    expect(validateIsakForm({ ...rawA, tricepsSkinfoldMm: "1" }).ok).toBe(true);
    expect(errorsOf({ ...rawA, femurBreadthCm: "25" }).femurBreadthCm).toBe(ISAK_FORM_TEXT.range.breadths);
    expect(errorsOf({ ...rawA, waistCm: "5" }).waistCm).toBe(ISAK_FORM_TEXT.range.girths);
    expect(errorsOf({ ...rawA, weightKg: "9,9" }).weightKg).toBe(ISAK_FORM_TEXT.range.weightKg);
  });

  it("formato inválido", () => {
    const errors = errorsOf({ ...rawA, calfCm: "11,55" });
    expect(errors.calfCm).toBe("Revisá el valor: usá un número con hasta 1 decimal");
    expect(Object.keys(errors)).toEqual(["calfCm"]);
  });

  it("talla sentado mayor que la talla", () => {
    expect(errorsOf({ ...rawA, heightCm: "164", sittingHeightCm: "170" }).sittingHeightCm).toBe(
      "La talla sentado no puede ser mayor que la talla",
    );
    // Igual a la talla es válido (con 120: 164 quedaría fuera del rango 30–130 de la talla sentado).
    expect(validateIsakForm({ ...rawA, heightCm: "120", sittingHeightCm: "120" }).ok).toBe(true);
    expect(errorsOf({ ...rawA, heightCm: "120", sittingHeightCm: "120,5" }).sittingHeightCm).toBe(
      ISAK_FORM_TEXT.sittingAboveHeight,
    );
    // Con la talla inválida no se compara.
    expect(errorsOf({ ...rawA, heightCm: "", sittingHeightCm: "83" }).sittingHeightCm).toBeUndefined();
  });

  it("solo masa, talla y 8 pliegues → ok con el resto null", () => {
    const raw: Raw = Object.fromEntries(
      Object.entries(rawA).filter(([k]) => k === "weightKg" || k === "heightCm" || k.endsWith("SkinfoldMm")),
    );
    const r = validateIsakForm(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.measures.femurBreadthCm).toBeNull();
      expect(r.measures.sittingHeightCm).toBeNull();
      expect(r.measures.tricepsSkinfoldMm).toBe(11);
      expect(r.measures.weightKg).toBe(61);
    }
  });
});
