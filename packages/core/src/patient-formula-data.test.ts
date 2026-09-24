import { describe, expect, it } from "vitest";
import {
  ACTIVITY_LEVELS,
  ADJUSTMENT_RANGE_VALUES,
  ACTIVITY_LEVEL_VALUES,
  BODY_FRAMES,
  BODY_FRAME_VALUES,
  NUTRITION_GOALS,
  NUTRITION_GOAL_VALUES,
  SEX_OPTIONS,
  SEX_VALUES,
  activityLevelOption,
  bodyFrameLabel,
  PEDIATRIC_TEXT,
  ageGroupOf,
  ageMonthsLabel,
  computeAgeMonths,
  computeAgeYears,
  effectiveBodyFrame,
  formatDecimalEs,
  formatFixedEs,
  formatSignedFixedEs,
  formatSignedIntEs,
  formatSignedPercentEs,
  goalAdjustmentRange,
  getMissingFormulaData,
  isMinor,
  missingFormulaDataMessage,
  nutritionGoalLabel,
  sexLabel,
  type FormulaDataPresence,
} from "./patient-formula-data";

const complete: FormulaDataPresence = {
  sex: "FEMALE",
  activityLevel: "LIGHT",
  nutritionGoal: "LOSE_WEIGHT",
  hasBirthDate: true,
  weightKg: 66.5,
  heightCm: 162,
};

describe("constantes", () => {
  it("ACTIVITY_LEVELS tiene los 5 factores en orden", () => {
    expect(ACTIVITY_LEVELS.map((a) => a.factor)).toEqual([1.2, 1.375, 1.55, 1.725, 1.9]);
    expect(ACTIVITY_LEVELS.find((a) => a.value === "LIGHT")?.description).toBe(
      "Ejercicio ligero 1-3 días/semana",
    );
  });

  it("NUTRITION_GOALS tiene los 4 objetivos con sus rangos", () => {
    expect(NUTRITION_GOALS.map((g) => g.value)).toEqual([
      "LOSE_WEIGHT",
      "MAINTAIN",
      "GAIN_WEIGHT",
      "GAIN_MUSCLE",
    ]);
    expect(NUTRITION_GOALS.find((g) => g.value === "GAIN_MUSCLE")?.label).toBe("Ganar masa muscular");
    const lose = NUTRITION_GOALS.find((g) => g.value === "LOSE_WEIGHT")!;
    expect(lose.adjustmentRanges.map((r) => [r.minPercent, r.maxPercent])).toEqual([
      [-25, -15],
      [-30, -25],
    ]);
    const maintain = NUTRITION_GOALS.find((g) => g.value === "MAINTAIN")!;
    expect(maintain.adjustmentRanges.map((r) => [r.minPercent, r.maxPercent])).toEqual([[0, 0]]);
  });

  it("BODY_FRAMES ajusta Hamwi -10 / 0 / +10", () => {
    expect(BODY_FRAMES.map((b) => [b.value, b.hamwiAdjustmentPercent])).toEqual([
      ["SMALL", -10],
      ["MEDIUM", 0],
      ["LARGE", 10],
    ]);
  });

  it("los *_VALUES coinciden con los value de sus opciones", () => {
    expect(SEX_OPTIONS.map((o) => o.value)).toEqual([...SEX_VALUES]);
    expect(ACTIVITY_LEVELS.map((o) => o.value)).toEqual([...ACTIVITY_LEVEL_VALUES]);
    expect(NUTRITION_GOALS.map((o) => o.value)).toEqual([...NUTRITION_GOAL_VALUES]);
    expect(BODY_FRAMES.map((o) => o.value)).toEqual([...BODY_FRAME_VALUES]);
  });
});

describe("etiquetas y contextura", () => {
  it("effectiveBodyFrame asume Mediana si falta", () => {
    expect(effectiveBodyFrame(null)).toBe("MEDIUM");
    expect(effectiveBodyFrame("LARGE")).toBe("LARGE");
  });

  it("etiquetas", () => {
    expect(sexLabel(null)).toBeNull();
    expect(sexLabel("FEMALE")).toBe("Femenino");
    expect(activityLevelOption("MODERATE")?.factor).toBe(1.55);
    expect(activityLevelOption(null)).toBeNull();
    expect(nutritionGoalLabel("GAIN_WEIGHT")).toBe("Subir de peso");
    expect(nutritionGoalLabel(null)).toBeNull();
    expect(bodyFrameLabel("SMALL")).toBe("Pequeña");
    expect(bodyFrameLabel(null)).toBeNull();
  });
});

describe("computeAgeYears", () => {
  const tz = "America/Argentina/Buenos_Aires";
  const birth = new Date("1990-09-23T00:00:00Z");

  it("el día del cumpleaños ya cumplió", () => {
    expect(computeAgeYears(birth, new Date("2026-09-23T15:00:00Z"), tz)).toBe(36);
  });

  it("el día anterior todavía no cumplió", () => {
    expect(computeAgeYears(birth, new Date("2026-09-22T15:00:00Z"), tz)).toBe(35);
  });

  it("toma el 'hoy' en la zona de la profesional, no en UTC", () => {
    // 02:00 UTC del 23/09 = 23:00 del 22/09 en Buenos Aires.
    expect(computeAgeYears(birth, new Date("2026-09-23T02:00:00Z"), tz)).toBe(35);
  });

  it("nacido un 29/02 cumple el 01/03 en años no bisiestos", () => {
    const leap = new Date("2000-02-29T00:00:00Z");
    expect(computeAgeYears(leap, new Date("2026-02-28T15:00:00Z"), tz)).toBe(25);
    expect(computeAgeYears(leap, new Date("2026-03-01T15:00:00Z"), tz)).toBe(26);
  });

  it("isMinor", () => {
    expect(isMinor(17)).toBe(true);
    expect(isMinor(18)).toBe(false);
    expect(isMinor(null)).toBe(false);
  });
});

describe("faltantes", () => {
  it("todo cargado → sin faltantes ni aviso", () => {
    const items = getMissingFormulaData(complete);
    expect(items).toEqual([]);
    expect(missingFormulaDataMessage(items)).toBeNull();
  });

  it("paciente preexistente sin nada", () => {
    const items = getMissingFormulaData({
      sex: null,
      activityLevel: null,
      nutritionGoal: null,
      hasBirthDate: false,
      weightKg: null,
      heightCm: null,
    });
    expect(items.map((i) => i.key)).toEqual([
      "sex",
      "activityLevel",
      "nutritionGoal",
      "birthDate",
      "weight",
      "height",
    ]);
    expect(missingFormulaDataMessage(items)).toBe(
      'Faltan datos para los cálculos: sexo, actividad física, objetivo, fecha de nacimiento, peso, talla. La fecha de nacimiento se carga en "Datos". El peso y la talla se cargan en "Evolución".',
    );
  });

  it("preexistente con fecha, peso y talla", () => {
    const items = getMissingFormulaData({
      ...complete,
      sex: null,
      activityLevel: null,
      nutritionGoal: null,
    });
    expect(missingFormulaDataMessage(items)).toBe(
      "Faltan datos para los cálculos: sexo, actividad física, objetivo.",
    );
  });

  it("sin fecha de nacimiento y sin talla", () => {
    const items = getMissingFormulaData({ ...complete, hasBirthDate: false, heightCm: null });
    expect(missingFormulaDataMessage(items)).toBe(
      'Faltan datos para los cálculos: fecha de nacimiento, talla. La fecha de nacimiento se carga en "Datos". La talla se carga en "Evolución".',
    );
  });

  it("solo falta el peso", () => {
    const message = missingFormulaDataMessage(getMissingFormulaData({ ...complete, weightKg: null }));
    expect(message).toBe('Faltan datos para los cálculos: peso. El peso se carga en "Evolución".');
  });

  it("peso 0 cuenta como cargado (se decide por null, no por falsy)", () => {
    expect(getMissingFormulaData({ ...complete, weightKg: 0 })).toEqual([]);
  });

  it("contextura y % de grasa ausentes no son faltantes", () => {
    const withExtras = { ...complete, bodyFrame: null, bodyFatPercent: null };
    const input: FormulaDataPresence = withExtras;
    expect(getMissingFormulaData(input)).toEqual([]);
  });
});

describe("formatDecimalEs", () => {
  it("formatea con coma decimal", () => {
    expect(formatDecimalEs(66.5)).toBe("66,5");
    expect(formatDecimalEs(162)).toBe("162");
    expect(formatDecimalEs(1.375)).toBe("1,375");
    expect(formatDecimalEs(29.4)).toBe("29,4");
  });
});

describe("HU-004: rangos de ajuste y formatos con signo", () => {
  it("los rangos tienen key y shortLabel", () => {
    expect(
      NUTRITION_GOALS.map((g) => [g.value, g.adjustmentRanges.map((r) => [r.key, r.shortLabel, r.minPercent, r.maxPercent])]),
    ).toEqual([
      [
        "LOSE_WEIGHT",
        [
          ["MODERATE_DEFICIT", "Déficit moderado", -25, -15],
          ["AGGRESSIVE_DEFICIT", "Déficit agresivo", -30, -25],
        ],
      ],
      ["MAINTAIN", [["MAINTENANCE", "Mantenimiento", 0, 0]]],
      ["GAIN_WEIGHT", [["SURPLUS", "Superávit", 10, 20]]],
      ["GAIN_MUSCLE", [["SURPLUS", "Superávit", 10, 20]]],
    ]);
    expect(ADJUSTMENT_RANGE_VALUES).toEqual(["MODERATE_DEFICIT", "AGGRESSIVE_DEFICIT", "MAINTENANCE", "SURPLUS"]);
  });

  it("goalAdjustmentRange", () => {
    expect(goalAdjustmentRange("LOSE_WEIGHT", "AGGRESSIVE_DEFICIT")?.label).toBe("Déficit agresivo (con supervisión)");
    expect(goalAdjustmentRange("GAIN_MUSCLE", "SURPLUS")?.minPercent).toBe(10);
    expect(goalAdjustmentRange("LOSE_WEIGHT", "SURPLUS")).toBeNull();
    expect(goalAdjustmentRange("MAINTAIN", "MODERATE_DEFICIT")).toBeNull();
  });

  it("formatSignedPercentEs (U+2212)", () => {
    expect(formatSignedPercentEs(-20)).toBe("−20 %");
    expect(formatSignedPercentEs(15)).toBe("+15 %");
    expect(formatSignedPercentEs(0)).toBe("0 %");
  });

  it("formatSignedIntEs", () => {
    expect(formatSignedIntEs(-119)).toBe("−119");
    expect(formatSignedIntEs(50)).toBe("+50");
    expect(formatSignedIntEs(0)).toBe("0");
    expect(formatSignedIntEs(-0.4)).toBe("0");
    // kcal con separador de miles es-AR (decisión del orquestador)
    expect(formatSignedIntEs(1200)).toBe("+1.200");
  });
});

describe("HU-006: decimales fijos", () => {
  it("formatFixedEs", () => {
    expect(formatFixedEs(71, 1)).toBe("71,0");
    expect(formatFixedEs(2.8, 2)).toBe("2,80");
    expect(formatFixedEs(-0.04, 2)).toBe("-0,04");
    expect(formatFixedEs(-0.001, 2)).toBe("0,00");
    expect(formatFixedEs(98, 0)).toBe("98");
  });

  it("formatSignedFixedEs (U+2212)", () => {
    expect(formatSignedFixedEs(-9.5, 1)).toBe("−9,5");
    expect(formatSignedFixedEs(1.2, 1)).toBe("+1,2");
    expect(formatSignedFixedEs(0, 1)).toBe("0,0");
    expect(formatSignedFixedEs(-0.92, 2)).toBe("−0,92");
  });
});

// ── HU-008 ──
describe("HU-008: ageGroupOf", () => {
  it("null → ADULT; 4 → UNDER_5; 5 y 17 → PEDIATRIC; 18 → ADULT", () => {
    expect(ageGroupOf(null)).toBe("ADULT");
    expect(ageGroupOf(0)).toBe("UNDER_5");
    expect(ageGroupOf(4)).toBe("UNDER_5");
    expect(ageGroupOf(5)).toBe("PEDIATRIC");
    expect(ageGroupOf(17)).toBe("PEDIATRIC");
    expect(ageGroupOf(18)).toBe("ADULT");
  });
});

describe("HU-008: computeAgeMonths", () => {
  const tz = "America/Argentina/Buenos_Aires";
  it("Tomás: nacido 15/03/2014, consulta 10/09/2026 → 149", () => {
    expect(computeAgeMonths(new Date("2014-03-15"), new Date("2026-09-10T15:00:00Z"), tz)).toBe(149);
  });
  it("el día del cumple mensual ya cuenta → 150", () => {
    expect(computeAgeMonths(new Date("2014-03-15"), new Date("2026-09-15T15:00:00Z"), tz)).toBe(150);
  });
  it("zona horaria: 10/09 02:00 UTC es 09/09 en AR → 149, no 150", () => {
    expect(computeAgeMonths(new Date("2014-03-10"), new Date("2026-09-10T02:00:00Z"), tz)).toBe(149);
  });
  it("nacidos un 31: el 28/02 todavía no cumplieron el mes; el 01/03 sí", () => {
    expect(computeAgeMonths(new Date("2020-01-31"), new Date("2020-02-28T15:00:00Z"), tz)).toBe(0);
    expect(computeAgeMonths(new Date("2020-01-31"), new Date("2020-03-01T15:00:00Z"), tz)).toBe(1);
  });
  it("consistente con computeAgeYears (40 fechas)", () => {
    const birth = new Date("2014-03-15");
    for (let i = 0; i < 40; i++) {
      const at = new Date(Date.UTC(2024, i, 5, 15));
      const months = computeAgeMonths(birth, at, tz);
      expect(Math.floor(months / 12)).toBe(computeAgeYears(birth, at, tz));
    }
  });
});

describe("HU-008: ageMonthsLabel", () => {
  it.each([
    [149, "12 años y 5 meses (149 meses)"],
    [96, "8 años (96 meses)"],
    [61, "5 años y 1 mes (61 meses)"],
    [12, "1 año (12 meses)"],
  ])("%s → %s", (m, text) => {
    expect(ageMonthsLabel(m)).toBe(text);
  });
});

describe("HU-008: PEDIATRIC_TEXT", () => {
  it("textos exactos (U+2212 en las Z, U+2013 en el rango)", () => {
    expect(PEDIATRIC_TEXT.bmiForAgeReference).toBe("Normal: Z −2 a +1");
    expect(PEDIATRIC_TEXT.heightForAgeReference).toBe("Adecuada: Z ≥ −2");
    expect(PEDIATRIC_TEXT.proteinGPerKgHint).toBe("0,85–0,95 g/kg (IDR)");
    expect(PEDIATRIC_TEXT.under5).toBe("Menor de 5 años: el sistema no tiene referencias para esta edad.");
  });
});
