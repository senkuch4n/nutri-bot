import { describe, expect, it } from "vitest";
import {
  MEASURE_SUGGESTIONS,
  MEASURE_TEXT,
  cleanMeasureName,
  duplicateMeasureMessage,
  formatGrams,
  formatMeasureQty,
  legacyUnitHintText,
  measureAmountText,
  measureItemGrams,
  measureKcal,
  measureListLine,
  measureNameKey,
  measureOptionLabel,
  measurePreview,
  measureSavedInMessage,
  measureStepperAriaLabel,
  measureWithGramsText,
  normalizeMeasureInput,
  normalizeMeasureQty,
  parseUnitHint,
  pluralizeMeasureName,
  removeMeasureTitle,
  resolvedMeasurePlural,
  roundMeasureGrams,
  singularizeMeasureName,
  stepMeasureQty,
  unitHintPrefillName,
  validateMeasure,
} from "./household-measures";

describe("cantidad (D5)", () => {
  it("normalizeMeasureQty acepta cuartos entre ¼ y 20", () => {
    for (const v of [0.25, 1, 1.5, 20]) expect(normalizeMeasureQty(v)).toBe(v);
    for (const v of [0, 0.1, 1.3, 20.25, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(normalizeMeasureQty(v)).toBeNull();
    }
    expect(normalizeMeasureQty(0.1 + 0.15)).toBe(0.25);
  });

  it("stepMeasureQty suma y resta ¼ con topes", () => {
    expect(stepMeasureQty(1, 1)).toBe(1.25);
    expect(stepMeasureQty(1, -1)).toBe(0.75);
    expect(stepMeasureQty(0.25, -1)).toBe(0.25);
    expect(stepMeasureQty(20, 1)).toBe(20);
    expect(stepMeasureQty(Number.NaN, 1)).toBe(1.25);
  });

  it("formatMeasureQty usa fracciones", () => {
    const cases: [number, string][] = [
      [0.25, "¼"],
      [0.5, "½"],
      [0.75, "¾"],
      [1, "1"],
      [1.25, "1¼"],
      [1.5, "1½"],
      [1.75, "1¾"],
      [2, "2"],
      [20, "20"],
      [1.3, "1¼"],
    ];
    for (const [v, text] of cases) expect(formatMeasureQty(v)).toBe(text);
  });
});

describe("plural y singular (D6)", () => {
  it("pluralizeMeasureName", () => {
    const cases: [string, string][] = [
      ["taza", "tazas"],
      ["cda", "cdas"],
      ["cdita", "cditas"],
      ["vaso", "vasos"],
      ["café", "cafés"],
      ["unidad", "unidades"],
      ["unidad mediana", "unidades medianas"],
      ["taza de té", "tazas de té"],
      ["porción", "porciones"],
      ["nuez", "nueces"],
      ["filet", "filetes"],
      ["lata escurrida", "latas escurridas"],
      ["hamburguesa casera", "hamburguesas caseras"],
      ["Taza", "Tazas"],
      ["ají", "ajíes"],
      ["cc", "cc"],
      ["Porción", "Porciones"],
      ["  unidad   chica ", "unidades chicas"],
    ];
    for (const [s, p] of cases) expect(pluralizeMeasureName(s)).toBe(p);
  });

  it("singularizeMeasureName", () => {
    const cases: [string, string][] = [
      ["cucharadas", "cucharada"],
      ["unidades", "unidad"],
      ["cuadraditos", "cuadradito"],
      ["porciones", "porción"],
      ["nueces", "nuez"],
      ["cdas", "cda"],
      ["unidades medianas", "unidad mediana"],
      ["tazas de té", "taza de té"],
      ["taza", "taza"],
    ];
    for (const [p, s] of cases) expect(singularizeMeasureName(p)).toBe(s);
  });

  it("resolvedMeasurePlural: el escrito a mano o el automático", () => {
    expect(resolvedMeasurePlural({ name: "taza", plural: null })).toBe("tazas");
    expect(resolvedMeasurePlural({ name: "taza", plural: "  " })).toBe("tazas");
    expect(resolvedMeasurePlural({ name: "pan", plural: "panes chicos" })).toBe("panes chicos");
  });
});

describe("validación y normalización", () => {
  it("errores uno por campo con los textos del Gherkin", () => {
    expect(validateMeasure({ name: "", plural: null, grams: 10 })).toEqual([
      { field: "name", message: "Escribí el nombre de la medida (por ejemplo, taza)" },
    ]);
    expect(validateMeasure({ name: "a".repeat(41), plural: null, grams: 10 })).toEqual([
      { field: "name", message: MEASURE_TEXT.nameTooLong },
    ]);
    for (const g of [null, 0, -5, 0.04, 2000.1, Number.NaN]) {
      expect(validateMeasure({ name: "taza", plural: null, grams: g })).toEqual([
        { field: "grams", message: "Escribí cuántos gramos pesa una (entre 0,1 y 2000)" },
      ]);
    }
    expect(validateMeasure({ name: "taza", plural: null, grams: 0.05 })).toEqual([]);
    expect(validateMeasure({ name: "taza", plural: null, grams: 2000 })).toEqual([]);
    expect(validateMeasure({ name: "taza", plural: "b".repeat(41), grams: 10 })).toEqual([
      { field: "plural", message: MEASURE_TEXT.pluralTooLong },
    ]);
    expect(validateMeasure({ name: "  ", plural: "b".repeat(41), grams: 0 }).map((i) => i.field)).toEqual([
      "name",
      "plural",
      "grams",
    ]);
  });

  it("normalizeMeasureInput limpia, saca el plural automático y redondea", () => {
    expect(normalizeMeasureInput({ name: "  unidad   mediana ", plural: null, grams: 120 })).toEqual({
      name: "unidad mediana",
      nameKey: "unidad mediana",
      plural: null,
      grams: 120,
    });
    expect(normalizeMeasureInput({ name: "taza", plural: "tazas", grams: 180.04 })).toEqual({
      name: "taza",
      nameKey: "taza",
      plural: null,
      grams: 180,
    });
    expect(normalizeMeasureInput({ name: "pan", plural: " panes  chicos ", grams: 0.05 }).plural).toBe("panes chicos");
    expect(normalizeMeasureInput({ name: "pan", plural: null, grams: 0.05 }).grams).toBe(0.1);
    expect(() => normalizeMeasureInput({ name: "", plural: null, grams: 1 })).toThrow(RangeError);
  });

  it("clave sin mayúsculas ni tildes", () => {
    expect(measureNameKey("Taza")).toBe(measureNameKey("tazá"));
    expect(measureNameKey(" taza ")).toBe(measureNameKey("taza"));
    expect(cleanMeasureName("  unidad   mediana ")).toBe("unidad mediana");
    expect(roundMeasureGrams(6.25)).toBe(6.3);
    expect(roundMeasureGrams(Number.NaN)).toBeNull();
  });
});

describe("números y textos", () => {
  const taza = { name: "taza", plural: "tazas" };

  it("gramos y kcal", () => {
    expect(measureItemGrams(1.5, 180)).toBe(270);
    expect(measureItemGrams(0.25, 0.1)).toBe(0.03);
    expect(measureItemGrams(20, 2000)).toBe(40000);
    expect(measureKcal(130, 180)).toBe(234);
  });

  it("textos con cantidad", () => {
    expect(measureAmountText(0.5, taza)).toBe("½ taza");
    expect(measureAmountText(1, taza)).toBe("1 taza");
    expect(measureAmountText(1.5, taza)).toBe("1½ tazas");
    expect(measureAmountText(2, { name: "unidad mediana", plural: "unidades medianas" })).toBe(
      "2 unidades medianas",
    );
    expect(formatGrams(6.25)).toBe("6,3 g");
    expect(formatGrams(270)).toBe("270 g");
    expect(measureWithGramsText(1.5, taza, 270)).toBe("1½ tazas (270 g)");
    expect(measureOptionLabel({ name: "taza", grams: 180 })).toBe("taza (180 g)");
    expect(measureListLine({ name: "taza", grams: 180 }, 130)).toBe("1 taza = 180 g · 234 kcal");
  });

  it("vista previa", () => {
    const food = { name: "Arroz blanco, hervido", kcalPer100: 130 };
    expect(measurePreview({ name: "taza", plural: null, grams: 180 }, food)).toEqual({
      one: "1 taza de Arroz blanco, hervido = 180 g · 234 kcal",
      two: "2 tazas = 360 g",
    });
    expect(measurePreview({ name: "unidad mediana", plural: null, grams: 120 }, food)?.two).toBe(
      "2 unidades medianas = 240 g",
    );
    expect(measurePreview({ name: "pan", plural: "panes chicos", grams: 30 }, food)?.two).toBe("2 panes chicos = 60 g");
    expect(measurePreview({ name: "", plural: null, grams: 180 }, food)).toBeNull();
    expect(measurePreview({ name: "taza", plural: null, grams: 0 }, food)).toBeNull();
  });

  it("textos fijos y con nombre (Gherkin)", () => {
    expect({
      cardTitle: MEASURE_TEXT.cardTitle,
      addButton: MEASURE_TEXT.addButton,
      saved: MEASURE_TEXT.saved,
      empty: MEASURE_TEXT.empty,
      pluralLink: MEASURE_TEXT.pluralLink,
      modeHousehold: MEASURE_TEXT.modeHousehold,
      modeGrams: MEASURE_TEXT.modeGrams,
      addFromEditor: MEASURE_TEXT.addFromEditor,
      qtyError: MEASURE_TEXT.qtyError,
      removeDescription: MEASURE_TEXT.removeDescription,
      sessionExpired: MEASURE_TEXT.sessionExpired,
    }).toEqual({
      cardTitle: "Medidas caseras",
      addButton: "Agregar medida",
      saved: "Medida guardada",
      empty: "Todavía no tiene medidas caseras.",
      pluralLink: "¿Se escribe distinto en plural?",
      modeHousehold: "Medida casera",
      modeGrams: "Gramos",
      addFromEditor: "Agregar una medida casera a este alimento",
      qtyError: "No se pudo cambiar la cantidad. Probá de nuevo.",
      removeDescription: "Los planes que ya la usan no cambian.",
      sessionExpired: "Tu sesión venció. Volvé a entrar.",
    });
    expect(removeMeasureTitle("taza")).toBe("¿Quitar la medida «taza»?");
    expect(duplicateMeasureMessage("taza")).toBe("Este alimento ya tiene la medida «taza»");
    expect(measureSavedInMessage("Quinoa, cocida")).toBe("Medida guardada en Quinoa, cocida");
    expect(legacyUnitHintText("porción chica")).toBe(
      "Tenías anotado: «porción chica». Pasalo a una medida para usarlo en los planes.",
    );
    expect(measureStepperAriaLabel(1, "Arroz")).toBe("Sumar ¼ a Arroz");
    expect(measureStepperAriaLabel(-1, "Arroz")).toBe("Restar ¼ a Arroz");
    expect(MEASURE_SUGGESTIONS).toHaveLength(16);
    expect(MEASURE_SUGGESTIONS.find((s) => s.name === "cda")?.label).toBe("cda (cucharada)");
  });
});

describe("parseUnitHint (D9)", () => {
  // Los 55 textos distintos de la base de desarrollo (2026-10-04).
  const DB_HINTS: [string, { name: string; grams: number } | null][] = [
    ["1 bocha ≈ 60 g", { name: "bocha", grams: 60 }],
    ["1 clara ≈ 30 g", { name: "clara", grams: 30 }],
    ["1 copa ≈ 150 ml", { name: "copa", grams: 150 }],
    ["1 cucharada ≈ 10 g", { name: "cucharada", grams: 10 }],
    ["1 cucharada ≈ 12 g", { name: "cucharada", grams: 12 }],
    ["1 cucharada ≈ 15 g", { name: "cucharada", grams: 15 }],
    ["1 cucharada ≈ 15 ml", { name: "cucharada", grams: 15 }],
    ["1 cucharada ≈ 20 g", { name: "cucharada", grams: 20 }],
    ["1 cucharadita ≈ 5 g", { name: "cucharadita", grams: 5 }],
    ["1 cucharadita ≈ 5 ml", { name: "cucharadita", grams: 5 }],
    ["1 feta ≈ 25 g", { name: "feta", grams: 25 }],
    ["1 fetita ≈ 25 g", { name: "fetita", grams: 25 }],
    ["1 filet ≈ 180 g", { name: "filet", grams: 180 }],
    ["1 filete ≈ 150 g", { name: "filete", grams: 150 }],
    ["1 hamburguesa casera ≈ 120 g", { name: "hamburguesa casera", grams: 120 }],
    ["1 huevo mediano ≈ 50 g", { name: "huevo mediano", grams: 50 }],
    ["1 lata escurrida ≈ 170 g", { name: "lata escurrida", grams: 170 }],
    ["1 lata ≈  lata 473 ml", null],
    ["1 plato ≈ 200 g", { name: "plato", grams: 200 }],
    ["1 porción ≈ 120 g", { name: "porción", grams: 120 }],
    ["1 porción ≈ 125 g", { name: "porción", grams: 125 }],
    ["1 porción ≈ 50 g", { name: "porción", grams: 50 }],
    ["1 pote ≈ 190 g", { name: "pote", grams: 190 }],
    ["1 puñado ≈ 30 g", { name: "puñado", grams: 30 }],
    ["1 taza ≈ 150 g", { name: "taza", grams: 150 }],
    ["1 taza ≈ 160 g", { name: "taza", grams: 160 }],
    ["1 taza ≈ 165 g", { name: "taza", grams: 165 }],
    ["1 taza ≈ 180 g", { name: "taza", grams: 180 }],
    ["1 taza ≈ 185 g", { name: "taza", grams: 185 }],
    ["1 taza ≈ 200 g", { name: "taza", grams: 200 }],
    ["1 taza ≈ 200 ml", { name: "taza", grams: 200 }],
    ["1 taza ≈ 240 g", { name: "taza", grams: 240 }],
    ["1 taza ≈ 250 ml", { name: "taza", grams: 250 }],
    ["1 unidad chica ≈ 50 g", { name: "unidad chica", grams: 50 }],
    ["1 unidad mediana ≈ 110 g", { name: "unidad mediana", grams: 110 }],
    ["1 unidad mediana ≈ 120 g", { name: "unidad mediana", grams: 120 }],
    ["1 unidad mediana ≈ 150 g", { name: "unidad mediana", grams: 150 }],
    ["1 unidad mediana ≈ 170 g", { name: "unidad mediana", grams: 170 }],
    ["1 unidad mediana ≈ 180 g", { name: "unidad mediana", grams: 180 }],
    ["1 unidad mediana ≈ 70 g", { name: "unidad mediana", grams: 70 }],
    ["1 unidad ≈ 150 g", { name: "unidad", grams: 150 }],
    ["1 unidad ≈ 50 g", { name: "unidad", grams: 50 }],
    ["1 unidad ≈ 75 g", { name: "unidad", grams: 75 }],
    ["1 unidad ≈ 90 g", { name: "unidad", grams: 90 }],
    ["1 vaso ≈ 200 ml", { name: "vaso", grams: 200 }],
    ["1 vaso ≈ 250 ml", { name: "vaso", grams: 250 }],
    ["1/2 taza ≈ 125 g", { name: "taza", grams: 250 }],
    ["1/2 unidad ≈ 100 g", { name: "unidad", grams: 200 }],
    ["2 cuadraditos ≈ 10 g", { name: "cuadradito", grams: 5 }],
    ["2 cucharadas ≈ 30 g", { name: "cucharada", grams: 15 }],
    ["2 cucharadas ≈ 50 g", { name: "cucharada", grams: 25 }],
    ["3 cucharadas ≈ 30 g", { name: "cucharada", grams: 10 }],
    ["4 unidades ≈ 25 g", { name: "unidad", grams: 6.3 }],
    ["6 unidades ≈ 25 g", { name: "unidad", grams: 4.2 }],
    ["usar con moderación", null],
  ];

  it("lee los 55 textos de la base (53 legibles, 2 ilegibles)", () => {
    expect(DB_HINTS).toHaveLength(55);
    for (const [text, expected] of DB_HINTS) expect(parseUnitHint(text), text).toEqual(expected);
    expect(DB_HINTS.filter(([, e]) => e === null)).toHaveLength(2);
  });

  it("otras formas", () => {
    expect(parseUnitHint("1 taza = 180 gr.")).toEqual({ name: "taza", grams: 180 });
    expect(parseUnitHint("1 taza ~ 180 gramos")).toEqual({ name: "taza", grams: 180 });
    expect(parseUnitHint("1 vaso ≈ 200 cc")).toEqual({ name: "vaso", grams: 200 });
    expect(parseUnitHint("1,5 tazas ≈ 270 g")).toEqual({ name: "taza", grams: 180 });
    expect(parseUnitHint("1.5 tazas ≈ 270 g")).toEqual({ name: "taza", grams: 180 });
    expect(parseUnitHint("1 1/2 taza ≈ 270 g")).toEqual({ name: "taza", grams: 180 });
    expect(parseUnitHint("")).toBeNull();
    expect(parseUnitHint(null)).toBeNull();
    expect(parseUnitHint(undefined)).toBeNull();
    expect(parseUnitHint("0 taza ≈ 10 g")).toBeNull();
    expect(parseUnitHint("1 taza ≈ 3000 g")).toBeNull();
    expect(parseUnitHint(`1 ${"a".repeat(41)} ≈ 10 g`)).toBeNull();
    expect(parseUnitHint("1 taza 2 ≈ 10 g")).toBeNull();
    expect(parseUnitHint("porción chica")).toBeNull();
  });

  it("unitHintPrefillName limpia y corta a 40", () => {
    expect(unitHintPrefillName("  porción   chica ")).toBe("porción chica");
    expect(unitHintPrefillName("x".repeat(60))).toHaveLength(40);
  });
});
