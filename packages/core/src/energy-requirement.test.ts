import { describe, expect, it } from "vitest";
import { roundTo } from "./anthropometry";
import {
  REQUIREMENT_TEXT,
  adjustmentRangeHint,
  adjustmentRangeOptionLabel,
  buildPrescriptionSnapshot,
  calculateRequirement,
  computeMacros,
  cunninghamBmr,
  defaultAdjustmentPercent,
  draftFromPrescription,
  getRequirementBlockingMissing,
  harrisBenedictBmr,
  initialRequirementDraft,
  katchMcArdleBmr,
  leanBodyMassKg,
  mifflinStJeorBmr,
  prescriptionDiffText,
  prescriptionFormulaLine,
  prescriptionHeadline,
  prescriptionWeightLine,
  vctDifferenceText,
  type PrescriptionChoices,
  type RequirementContext,
  type RequirementDraft,
} from "./energy-requirement";
import { formatMacroAmount } from "./nutrition";
import { NUTRITION_GOALS, missingFormulaDataMessage, type GoalAdjustmentRange } from "./patient-formula-data";

// Las kcal se muestran con separador de miles es-AR y espacio duro (formatMacroAmount).
const NBSP = " ";
const kcalText = (v: number) => formatMacroAmount(v, "kcal");

const ana: RequirementContext = {
  sex: "FEMALE",
  ageYears: 34,
  heightCm: 162,
  actualWeightKg: 66.5,
  measuredBodyFatPercent: 29.4,
};

const luis: RequirementContext = {
  sex: "MALE",
  ageYears: 45,
  heightCm: 180,
  actualWeightKg: 118,
  measuredBodyFatPercent: null,
};

const baseDraft: RequirementDraft = {
  bmrFormula: "MIFFLIN_ST_JEOR",
  weightBasis: "ACTUAL",
  bodyFatSource: "MEASURED",
  activityLevel: "LIGHT",
  nutritionGoal: "LOSE_WEIGHT",
  adjustmentRange: "MODERATE_DEFICIT",
  adjustmentPercent: -20,
  prescribedVctKcal: 1481,
  macros: { mode: "PERCENT_OF_VCT", proteinPercent: 20, fatPercent: 30, carbPercent: 50 },
};

function range(key: string): GoalAdjustmentRange {
  for (const g of NUTRITION_GOALS) {
    const r = g.adjustmentRanges.find((x) => x.key === key);
    if (r) return r;
  }
  throw new Error(key);
}

describe("TMB", () => {
  it("Mifflin Ana: 10·66,5 + 6,25·162 − 5·34 − 161 = 665 + 1012,5 − 170 − 161 = 1346,5", () => {
    const v = mifflinStJeorBmr({ sex: "FEMALE", weightKg: 66.5, heightCm: 162, ageYears: 34 });
    expect(v).toBeCloseTo(1346.5, 6);
    expect(kcalText(v)).toBe(`1.347${NBSP}kcal`);
  });

  it("Harris-Benedict Ana: 447,593 + 614,9255 + 501,876 − 147,22 = 1417,1745", () => {
    const v = harrisBenedictBmr({ sex: "FEMALE", weightKg: 66.5, heightCm: 162, ageYears: 34 });
    expect(v).toBeCloseTo(1417.1745, 6);
    expect(Math.round(v)).toBe(1417);
  });

  it("masa magra 66,5·0,706 = 46,949; Katch 370 + 21,6·46,949 = 1384,0984; Cunningham 500 + 22·46,949 = 1532,878", () => {
    const lean = leanBodyMassKg(66.5, 29.4);
    expect(lean).toBeCloseTo(46.949, 6);
    expect(katchMcArdleBmr(lean)).toBeCloseTo(1384.0984, 6);
    expect(Math.round(katchMcArdleBmr(lean))).toBe(1384);
    expect(cunninghamBmr(lean)).toBeCloseTo(1532.878, 6);
    expect(Math.round(cunninghamBmr(lean))).toBe(1533);
  });

  it("Mifflin Luis (actual): 1180 + 1125 − 225 + 5 = 2085", () => {
    expect(mifflinStJeorBmr({ sex: "MALE", weightKg: 118, heightCm: 180, ageYears: 45 })).toBeCloseTo(2085, 6);
  });

  it("Harris-Benedict Luis con 85,74409: 88,362 + 1148,7236 + 863,82 − 255,465 = 1845,4306", () => {
    const v = harrisBenedictBmr({ sex: "MALE", weightKg: 85.744094, heightCm: 180, ageYears: 45 });
    expect(v).toBeCloseTo(1845.4306, 3);
    expect(Math.round(v)).toBe(1845);
  });
});

describe("calculateRequirement: Ana, borrador base", () => {
  const calc = calculateRequirement(ana, baseDraft);

  it("TMB de las 4 fórmulas con el peso actual", () => {
    expect(calc.bmrByFormula.MIFFLIN_ST_JEOR).toBeCloseTo(1346.5, 6);
    expect(calc.bmrByFormula.HARRIS_BENEDICT).toBeCloseTo(1417.1745, 6);
    expect(calc.bmrByFormula.KATCH_MCARDLE).toBeCloseTo(1384.0984, 6);
    expect(calc.bmrByFormula.CUNNINGHAM).toBeCloseTo(1532.878, 6);
    expect(calc.weightUsedKg).toBe(66.5);
    expect(calc.suggestAdjustedWeight).toBe(false);
  });

  it("GET 1346,5·1,375 = 1851,4375; VCT −20 %: 1851,4375·0,8 = 1481,15", () => {
    expect(calc.totalExpenditureKcal).toBeCloseTo(1851.4375, 6);
    expect(kcalText(calc.totalExpenditureKcal!)).toBe(`1.851${NBSP}kcal`);
    expect(calc.calculatedVctKcal).toBeCloseTo(1481.15, 6);
    expect(kcalText(calc.calculatedVctKcal!)).toBe(`1.481${NBSP}kcal`);
  });

  it("macros 20/30/50 sobre 1481 kcal con 66,5 kg", () => {
    // P: 1481·0,2 = 296,2 kcal / 4 = 74,05 g / 66,5 = 1,1135 g/kg
    // G: 444,3 / 9 = 49,367 g / 66,5 = 0,7424
    // C: 740,5 / 4 = 185,125 g / 66,5 = 2,7838
    const [p, g, c] = calc.macros!.lines;
    expect([Math.round(p.kcal), Math.round(p.grams), roundTo(p.gramsPerKg, 1)]).toEqual([296, 74, 1.1]);
    expect([Math.round(g.kcal), Math.round(g.grams), roundTo(g.gramsPerKg, 1)]).toEqual([444, 49, 0.7]);
    expect([Math.round(c.kcal), Math.round(c.grams), roundTo(c.gramsPerKg, 1)]).toEqual([741, 185, 2.8]);
    expect(p.grams).toBeCloseTo(74.05, 6);
    expect(g.grams).toBeCloseTo(49.366667, 5);
    expect(c.grams).toBeCloseTo(185.125, 6);
    expect(calc.macros!.percentSum).toBe(100);
    expect(calc.errors).toEqual([]);
    expect(calc.warnings).toEqual([]);
  });

  it("VCT −15 % (editar): 1851,4375·0,85 = 1573,72188 → 1574", () => {
    const c = calculateRequirement(ana, { ...baseDraft, adjustmentPercent: -15 });
    expect(c.calculatedVctKcal).toBeCloseTo(1573.721875, 6);
    expect(Math.round(c.calculatedVctKcal!)).toBe(1574);
    expect(c.errors).toEqual([]);
  });
});

describe("calculateRequirement: validaciones", () => {
  it("suma 20/30/45 = 95 → error de suma", () => {
    const c = calculateRequirement(ana, {
      ...baseDraft,
      macros: { mode: "PERCENT_OF_VCT", proteinPercent: 20, fatPercent: 30, carbPercent: 45 },
    });
    expect(c.errors).toEqual(["Los porcentajes suman 95 %; tienen que sumar 100 %"]);
  });

  it("ajuste −35 en moderado → fuera de rango", () => {
    const c = calculateRequirement(ana, { ...baseDraft, adjustmentPercent: -35 });
    expect(c.errors).toEqual(["El ajuste para déficit moderado va de −15 % a −25 %"]);
    expect(c.calculatedVctKcal).toBeNull();
  });

  it("ajuste −25 es borde incluido en moderado y en agresivo", () => {
    expect(calculateRequirement(ana, { ...baseDraft, adjustmentPercent: -25 }).errors).toEqual([]);
    expect(
      calculateRequirement(ana, { ...baseDraft, adjustmentRange: "AGGRESSIVE_DEFICIT", adjustmentPercent: -25 }).errors,
    ).toEqual([]);
  });

  it("ajuste no entero y faltante", () => {
    expect(calculateRequirement(ana, { ...baseDraft, adjustmentPercent: -20.5 }).errors).toEqual([
      REQUIREMENT_TEXT.adjustmentNotInteger,
    ]);
    expect(calculateRequirement(ana, { ...baseDraft, adjustmentPercent: null }).errors).toEqual([
      REQUIREMENT_TEXT.adjustmentMissing,
    ]);
  });

  it("SURPLUS en LOSE_WEIGHT → rangeMissing", () => {
    const c = calculateRequirement(ana, { ...baseDraft, adjustmentRange: "SURPLUS", adjustmentPercent: 15 });
    expect(c.errors).toEqual([REQUIREMENT_TEXT.rangeMissing]);
  });

  it("actividad y objetivo sin elegir", () => {
    const c = calculateRequirement(ana, { ...baseDraft, activityLevel: null, nutritionGoal: null });
    expect(c.errors).toEqual([REQUIREMENT_TEXT.activityMissing, REQUIREMENT_TEXT.goalMissing]);
    expect(c.totalExpenditureKcal).toBeNull();
  });

  it.each([
    [799, REQUIREMENT_TEXT.vctOutOfRange],
    [6001, REQUIREMENT_TEXT.vctOutOfRange],
    [1481.5, REQUIREMENT_TEXT.vctNotInteger],
    [null, REQUIREMENT_TEXT.vctMissing],
  ] as const)("VCT indicado %s → %s", (vct, error) => {
    expect(calculateRequirement(ana, { ...baseDraft, prescribedVctKcal: vct }).errors).toEqual([error]);
  });

  it("bordes del VCT 800 y 6000 son válidos", () => {
    expect(calculateRequirement(ana, { ...baseDraft, prescribedVctKcal: 800 }).errors).toEqual([]);
    expect(calculateRequirement(ana, { ...baseDraft, prescribedVctKcal: 6000 }).errors).not.toContain(
      REQUIREMENT_TEXT.vctOutOfRange,
    );
  });

  it("Katch-McArdle elegida sin % de grasa → null y bodyFatNeeded", () => {
    const c = calculateRequirement(ana, { ...baseDraft, bmrFormula: "KATCH_MCARDLE", bodyFatSource: null });
    expect(c.bmrByFormula.KATCH_MCARDLE).toBeNull();
    expect(c.bmrByFormula.CUNNINGHAM).toBeNull();
    expect(c.errors).toEqual([REQUIREMENT_TEXT.bodyFatNeeded]);
  });

  it("MAINTENANCE exige ajuste 0", () => {
    const d: RequirementDraft = { ...baseDraft, nutritionGoal: "MAINTAIN", adjustmentRange: "MAINTENANCE" };
    expect(calculateRequirement(ana, { ...d, adjustmentPercent: 0 }).errors).toEqual([]);
    expect(calculateRequirement(ana, { ...d, adjustmentPercent: 5 }).errors).toEqual([
      "El ajuste para mantenimiento es 0 %",
    ]);
  });
});

describe("calculateRequirement: Luis con peso ajustado", () => {
  it("Mifflin con 85,74409 = 857,4409 + 1125 − 225 + 5 = 1762,4409; Katch con Deurenberg usa el peso actual", () => {
    const c = calculateRequirement(luis, {
      ...baseDraft,
      weightBasis: "ADJUSTED",
      bodyFatSource: "DEURENBERG",
      activityLevel: "SEDENTARY",
    });
    expect(c.suggestAdjustedWeight).toBe(true);
    expect(c.weightUsedKg).toBeCloseTo(85.744094, 5);
    expect(c.bmrByFormula.MIFFLIN_ST_JEOR).toBeCloseTo(1762.44094, 4);
    expect(Math.round(c.bmrByFormula.MIFFLIN_ST_JEOR!)).toBe(1762);
    // magra = 118·(1 − 0,3785370) = 73,33263 → 370 + 21,6·73,33263 = 1953,9848
    expect(c.bodyFatPercent).toBeCloseTo(37.853704, 5);
    expect(c.bmrByFormula.KATCH_MCARDLE).toBeCloseTo(1953.9848, 3);
    expect(Math.round(c.bmrByFormula.KATCH_MCARDLE!)).toBe(1954);
  });

  it("sin % medido y sin fuente: Katch y Cunningham quedan en null", () => {
    const c = calculateRequirement(luis, { ...baseDraft, bodyFatSource: "MEASURED" });
    expect(c.bodyFatPercent).toBeNull();
    expect(c.bmrByFormula.KATCH_MCARDLE).toBeNull();
    expect(c.deurenbergBodyFatPercent).toBeCloseTo(37.853704, 5);
  });
});

describe("computeMacros", () => {
  it("g/kg 1,6 + grasas 30 %: carbohidratos como resto y un solo aviso", () => {
    // P: 1,6·66,5 = 106,4 g · 4 = 425,6 kcal · /1481 = 28,737 %
    // G: 444,3 kcal, 49,367 g
    // C: 1481 − 425,6 − 444,3 = 611,1 kcal / 4 = 152,775 g · /1481 = 41,263 %
    const m = computeMacros({
      prescribedVctKcal: 1481,
      weightKg: 66.5,
      macros: { mode: "PROTEIN_PER_KG", proteinGPerKg: 1.6, fatPercent: 30 },
    });
    const [p, g, c] = m.lines;
    expect([Math.round(p.grams), Math.round(p.kcal), roundTo(p.percent, 1)]).toEqual([106, 426, 28.7]);
    expect([Math.round(g.grams), Math.round(g.kcal), roundTo(g.percent, 1)]).toEqual([49, 444, 30]);
    expect([Math.round(c.grams), Math.round(c.kcal), roundTo(c.percent, 1)]).toEqual([153, 611, 41.3]);
    expect(c.kcal).toBeCloseTo(611.1, 6);
    expect(m.percentSum).toBeCloseTo(100, 6);
    expect(m.errors).toEqual([]);
    expect(m.warnings).toEqual(["Carbohidratos 41,3 %: fuera del rango de referencia (45–60 %)"]);
  });

  it("g/kg con carbohidratos negativos: 4·66,5 = 266 g = 1064 kcal; 1481 − 1064 − 518,35 = −101,35", () => {
    const m = computeMacros({
      prescribedVctKcal: 1481,
      weightKg: 66.5,
      macros: { mode: "PROTEIN_PER_KG", proteinGPerKg: 4, fatPercent: 35 },
    });
    expect(m.lines[2].kcal).toBeCloseTo(-101.35, 6);
    expect(m.errors).toEqual([REQUIREMENT_TEXT.negativeCarbs]);
    expect(m.warnings).toEqual([]);
  });

  it("proteína en g/kg fuera de la referencia (2,5) → aviso por g/kg", () => {
    const m = computeMacros({
      prescribedVctKcal: 2500,
      weightKg: 60,
      macros: { mode: "PROTEIN_PER_KG", proteinGPerKg: 2.5, fatPercent: 30 },
    });
    // P: 2,5·60·4 = 600 kcal (24 %); C: 2500 − 600 − 750 = 1150 (46 %)
    expect(m.warnings).toEqual(["Proteínas 2,5 g/kg: fuera del rango de referencia (1,2–2,2 g/kg)"]);
  });

  it("límites de los inputs", () => {
    expect(
      computeMacros({
        prescribedVctKcal: 1481,
        weightKg: 66.5,
        macros: { mode: "PROTEIN_PER_KG", proteinGPerKg: 0.4, fatPercent: 30 },
      }).errors,
    ).toEqual([REQUIREMENT_TEXT.proteinGPerKgOutOfBounds]);
    expect(
      computeMacros({
        prescribedVctKcal: 1481,
        weightKg: 66.5,
        macros: { mode: "PERCENT_OF_VCT", proteinPercent: -5, fatPercent: 55, carbPercent: 50 },
      }).errors,
    ).toEqual([REQUIREMENT_TEXT.percentOutOfBounds]);
    expect(
      computeMacros({
        prescribedVctKcal: 1481,
        weightKg: 66.5,
        macros: { mode: "PERCENT_OF_VCT", proteinPercent: 20.25, fatPercent: 29.75, carbPercent: 50 },
      }).errors,
    ).toEqual([REQUIREMENT_TEXT.percentDecimals]);
  });

  it("% fuera de referencia en modo % del VCT (bordes incluidos no avisan)", () => {
    const inRange = computeMacros({
      prescribedVctKcal: 2000,
      weightKg: 60,
      macros: { mode: "PERCENT_OF_VCT", proteinPercent: 25, fatPercent: 20, carbPercent: 55 },
    });
    expect(inRange.warnings).toEqual([]);
    const out = computeMacros({
      prescribedVctKcal: 2000,
      weightKg: 60,
      macros: { mode: "PERCENT_OF_VCT", proteinPercent: 30, fatPercent: 30, carbPercent: 40 },
    });
    expect(out.warnings).toEqual([
      "Proteínas 30 %: fuera del rango de referencia (15–25 %)",
      "Carbohidratos 40 %: fuera del rango de referencia (45–60 %)",
    ]);
  });
});

describe("ajuste por objetivo (D9)", () => {
  it("defaultAdjustmentPercent: (−25 − 15)/2 = −20; (−30 − 25)/2 = −27,5 → −28; 0; 15", () => {
    expect(defaultAdjustmentPercent(range("MODERATE_DEFICIT"))).toBe(-20);
    expect(defaultAdjustmentPercent(range("AGGRESSIVE_DEFICIT"))).toBe(-28);
    expect(Object.is(defaultAdjustmentPercent(range("MAINTENANCE")), 0)).toBe(true);
    expect(defaultAdjustmentPercent(range("SURPLUS"))).toBe(15);
  });

  it("etiquetas de opción", () => {
    expect(adjustmentRangeOptionLabel(range("MODERATE_DEFICIT"))).toBe("Déficit moderado (−15 a −25 %)");
    expect(adjustmentRangeOptionLabel(range("AGGRESSIVE_DEFICIT"))).toBe("Déficit agresivo (−25 a −30 %)");
    expect(adjustmentRangeOptionLabel(range("SURPLUS"))).toBe("Superávit (+10 a +20 %)");
    expect(adjustmentRangeOptionLabel(range("MAINTENANCE"))).toBe("Mantenimiento (0 %)");
    expect(adjustmentRangeHint(range("MODERATE_DEFICIT"))).toBe("Entre −15 % y −25 %");
  });

  it("texto de fuera de rango", () => {
    expect(REQUIREMENT_TEXT.adjustmentOutOfRange(range("SURPLUS"))).toBe(
      "El ajuste para superávit va de +10 % a +20 %",
    );
  });
});

describe("initialRequirementDraft", () => {
  it("Ana sin referencia", () => {
    expect(
      initialRequirementDraft({
        ctx: ana,
        patientActivityLevel: "LIGHT",
        patientNutritionGoal: "LOSE_WEIGHT",
        reference: null,
      }),
    ).toEqual({
      bmrFormula: "MIFFLIN_ST_JEOR",
      weightBasis: "ACTUAL",
      bodyFatSource: "MEASURED",
      activityLevel: "LIGHT",
      nutritionGoal: "LOSE_WEIGHT",
      adjustmentRange: "MODERATE_DEFICIT",
      adjustmentPercent: -20,
      prescribedVctKcal: null,
      macros: { mode: "PERCENT_OF_VCT", proteinPercent: 20, fatPercent: 30, carbPercent: 50 },
    });
  });

  it("Luis → ADJUSTED y sin fuente de grasa", () => {
    const d = initialRequirementDraft({
      ctx: luis,
      patientActivityLevel: "SEDENTARY",
      patientNutritionGoal: "LOSE_WEIGHT",
      reference: null,
    });
    expect(d.weightBasis).toBe("ADJUSTED");
    expect(d.bodyFatSource).toBeNull();
  });

  it("GAIN_MUSCLE arranca en g/kg 1,6 con grasas 30 %", () => {
    const d = initialRequirementDraft({
      ctx: ana,
      patientActivityLevel: "LIGHT",
      patientNutritionGoal: "GAIN_MUSCLE",
      reference: null,
    });
    expect(d.macros).toEqual({ mode: "PROTEIN_PER_KG", proteinGPerKg: 1.6, fatPercent: 30 });
    expect(d.adjustmentRange).toBe("SURPLUS");
    expect(d.adjustmentPercent).toBe(15);
  });

  const reference = {
    bmrFormula: "KATCH_MCARDLE" as const,
    adjustmentRange: "AGGRESSIVE_DEFICIT" as const,
    adjustmentPercent: -27,
    macroMode: "PERCENT_OF_VCT" as const,
    proteinPercent: 25,
    fatPercent: 25,
    carbPercent: 50,
    proteinGPerKg: null,
  };

  it("referencia con Katch y sin % medido → Mifflin; rango agresivo −27 se conserva", () => {
    const d = initialRequirementDraft({
      ctx: luis,
      patientActivityLevel: null,
      patientNutritionGoal: "LOSE_WEIGHT",
      reference,
    });
    expect(d.bmrFormula).toBe("MIFFLIN_ST_JEOR");
    expect(d.adjustmentRange).toBe("AGGRESSIVE_DEFICIT");
    expect(d.adjustmentPercent).toBe(-27);
    expect(d.macros).toEqual({ mode: "PERCENT_OF_VCT", proteinPercent: 25, fatPercent: 25, carbPercent: 50 });
    expect(d.activityLevel).toBeNull();
  });

  it("referencia con Katch y % medido → Katch", () => {
    const d = initialRequirementDraft({ ctx: ana, patientActivityLevel: "LIGHT", patientNutritionGoal: "LOSE_WEIGHT", reference });
    expect(d.bmrFormula).toBe("KATCH_MCARDLE");
  });

  it("objetivo distinto del de la referencia → punto medio del rango nuevo", () => {
    const d = initialRequirementDraft({ ctx: ana, patientActivityLevel: "LIGHT", patientNutritionGoal: "GAIN_WEIGHT", reference });
    expect(d.adjustmentRange).toBe("SURPLUS");
    expect(d.adjustmentPercent).toBe(15);
  });

  it("objetivo null → rango y ajuste null", () => {
    const d = initialRequirementDraft({ ctx: ana, patientActivityLevel: "LIGHT", patientNutritionGoal: null, reference: null });
    expect(d.adjustmentRange).toBeNull();
    expect(d.adjustmentPercent).toBeNull();
  });
});

describe("buildPrescriptionSnapshot", () => {
  const choices: PrescriptionChoices = {
    ...baseDraft,
    activityLevel: "LIGHT",
    nutritionGoal: "LOSE_WEIGHT",
    adjustmentRange: "MODERATE_DEFICIT",
    adjustmentPercent: -20,
    prescribedVctKcal: 1481,
  };

  it("Ana: valores redondeados tal como se guardan", () => {
    const r = buildPrescriptionSnapshot(ana, choices);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.snapshot).toMatchObject({
      sex: "FEMALE",
      ageYears: 34,
      heightCm: 162,
      actualWeightKg: 66.5,
      bmrKcal: 1347,
      bmrMifflinStJeorKcal: 1347,
      bmrHarrisBenedictKcal: 1417,
      bmrKatchMcArdleKcal: 1384,
      bmrCunninghamKcal: 1533,
      totalExpenditureKcal: 1851,
      calculatedVctKcal: 1481,
      prescribedVctKcal: 1481,
      proteinG: 74,
      fatG: 49,
      carbG: 185,
      weightUsedKg: 66.5,
      idealWeightDevineKg: 54.19,
      activityFactor: 1.375,
      bodyFatPercent: 29.4,
      bodyFatSource: "MEASURED",
      macroMode: "PERCENT_OF_VCT",
      proteinPercent: 20,
      fatPercent: 30,
      carbPercent: 50,
      proteinGPerKg: null,
    });
  });

  it("con errores → ok false", () => {
    const r = buildPrescriptionSnapshot(ana, { ...choices, adjustmentPercent: -35 });
    expect(r).toEqual({ ok: false, errors: ["El ajuste para déficit moderado va de −15 % a −25 %"] });
  });

  it("g/kg: guarda los % derivados y el g/kg", () => {
    const r = buildPrescriptionSnapshot(ana, {
      ...choices,
      macros: { mode: "PROTEIN_PER_KG", proteinGPerKg: 1.6, fatPercent: 30 },
    });
    expect(r.ok && r.snapshot).toMatchObject({
      proteinPercent: 28.7,
      fatPercent: 30,
      carbPercent: 41.3,
      proteinGPerKg: 1.6,
      proteinG: 106,
      fatG: 49,
      carbG: 153,
    });
  });

  it("draftFromPrescription vuelve al borrador guardado", () => {
    const r = buildPrescriptionSnapshot(ana, choices);
    if (!r.ok) throw new Error("esperaba ok");
    expect(draftFromPrescription(r.snapshot, ana)).toEqual(baseDraft);
    expect(draftFromPrescription(r.snapshot, { ...ana, measuredBodyFatPercent: null }).bodyFatSource).toBeNull();
  });
});

describe("textos de resumen", () => {
  const r = buildPrescriptionSnapshot(ana, {
    ...baseDraft,
    activityLevel: "LIGHT",
    nutritionGoal: "LOSE_WEIGHT",
    adjustmentRange: "MODERATE_DEFICIT",
    adjustmentPercent: -20,
    prescribedVctKcal: 1481,
  });
  if (!r.ok) throw new Error("esperaba ok");
  const snap = r.snapshot;

  it("headline", () => {
    expect(prescriptionHeadline(snap)).toBe(`VCT 1.481${NBSP}kcal · P 74${NBSP}g · G 49${NBSP}g · C 185${NBSP}g`);
  });

  it("línea de fórmula", () => {
    expect(prescriptionFormulaLine(snap)).toBe(
      `Mifflin-St Jeor · TMB 1.347${NBSP}kcal · Ligero ×1,375 · GET 1.851${NBSP}kcal · Déficit moderado −20 %`,
    );
    expect(
      prescriptionFormulaLine({ ...snap, nutritionGoal: "MAINTAIN", adjustmentRange: "MAINTENANCE", adjustmentPercent: 0 }),
    ).toMatch(/ · Mantenimiento$/);
  });

  it("línea de peso", () => {
    expect(prescriptionWeightLine(snap)).toBe("Peso usado: 66,5 kg (actual)");
    expect(
      prescriptionWeightLine({ ...snap, weightBasis: "ADJUSTED", weightUsedKg: 85.74, idealWeightDevineKg: 74.99 }),
    ).toBe("Peso usado: 85,7 kg (ajustado; ideal Devine 75,0 kg)");
  });

  it("diferencia con la anterior: 1481 − 1600 = −119", () => {
    expect(prescriptionDiffText(1481, 1600, "12/08/2026")).toBe(`−119${NBSP}kcal respecto del 12/08/2026`);
    expect(prescriptionDiffText(1650, 1600, "12/08/2026")).toBe(`+50${NBSP}kcal respecto del 12/08/2026`);
    expect(prescriptionDiffText(1600, 1600, "12/08/2026")).toBe("Igual que el 12/08/2026");
  });

  it("diferencia del VCT indicado con el calculado: 1500 − 1481 = +19", () => {
    expect(vctDifferenceText(1500, 1481.15)).toBe(`Difiere del calculado en +19${NBSP}kcal`);
  });
});

describe("getRequirementBlockingMissing", () => {
  const complete = {
    sex: "FEMALE" as const,
    activityLevel: null,
    nutritionGoal: null,
    hasBirthDate: true,
    weightKg: 66.5,
    heightCm: 162,
  };

  it("sin actividad ni objetivo → no bloquea", () => {
    expect(getRequirementBlockingMissing(complete)).toEqual([]);
  });

  it("sin fecha de nacimiento → [birthDate] y el mensaje de la HU", () => {
    const items = getRequirementBlockingMissing({ ...complete, hasBirthDate: false });
    expect(items.map((i) => i.key)).toEqual(["birthDate"]);
    expect(missingFormulaDataMessage(items)).toBe(
      'Faltan datos para los cálculos: fecha de nacimiento. La fecha de nacimiento se carga en "Datos".',
    );
  });

  it("sin sexo, peso ni talla", () => {
    expect(
      getRequirementBlockingMissing({ ...complete, sex: null, weightKg: null, heightCm: null }).map((i) => i.key),
    ).toEqual(["sex", "weight", "height"]);
  });
});
