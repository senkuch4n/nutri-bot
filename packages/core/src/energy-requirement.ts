import {
  adjustedWeightKg,
  bmiExact,
  deurenbergBodyFatPercent,
  devineIdealWeightKg,
  roundTo,
  shouldSuggestAdjustedWeight,
} from "./anthropometry";
import { formatMacroAmount } from "./nutrition";
import {
  NUTRITION_GOALS,
  activityLevelOption,
  formatDecimalEs,
  formatSignedIntEs,
  formatSignedPercentEs,
  getMissingFormulaData,
  goalAdjustmentRange,
  type ActivityLevel,
  type AdjustmentRangeKey,
  type FormulaDataPresence,
  type GoalAdjustmentRange,
  type MissingFormulaDataItem,
  type NutritionGoal,
  type Sex,
} from "./patient-formula-data";

/**
 * HU-004 (épica 18): calculadora de requerimiento energético. TMB (4 fórmulas) → GET → VCT →
 * macros. Todo exacto; se redondea solo al mostrar o guardar. Los valores de las uniones
 * coinciden con los enums de Prisma del mismo nombre.
 */

const NBSP = " ";

// ── TMB (kcal/día, exactas) ──
export const BMR_FORMULA_VALUES = ["MIFFLIN_ST_JEOR", "HARRIS_BENEDICT", "KATCH_MCARDLE", "CUNNINGHAM"] as const;
export type BmrFormula = (typeof BMR_FORMULA_VALUES)[number];
export const BMR_FORMULAS: ReadonlyArray<{ value: BmrFormula; label: string; needsBodyFat: boolean }> = [
  { value: "MIFFLIN_ST_JEOR", label: "Mifflin-St Jeor", needsBodyFat: false },
  { value: "HARRIS_BENEDICT", label: "Harris-Benedict", needsBodyFat: false },
  { value: "KATCH_MCARDLE", label: "Katch-McArdle", needsBodyFat: true },
  { value: "CUNNINGHAM", label: "Cunningham", needsBodyFat: true },
];
export const DEFAULT_BMR_FORMULA: BmrFormula = "MIFFLIN_ST_JEOR";

function bmrFormulaOption(value: BmrFormula) {
  return BMR_FORMULAS.find((f) => f.value === value)!;
}

export interface BmrPersonInput {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  ageYears: number;
}

/** 10·peso + 6.25·talla − 5·edad + (MALE 5 / FEMALE −161) */
export function mifflinStJeorBmr(p: BmrPersonInput): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.ageYears + (p.sex === "MALE" ? 5 : -161);
}

/** MALE 88.362 + 13.397·peso + 4.799·talla − 5.677·edad /
 *  FEMALE 447.593 + 9.247·peso + 3.098·talla − 4.330·edad */
export function harrisBenedictBmr(p: BmrPersonInput): number {
  if (p.sex === "MALE") return 88.362 + 13.397 * p.weightKg + 4.799 * p.heightCm - 5.677 * p.ageYears;
  return 447.593 + 9.247 * p.weightKg + 3.098 * p.heightCm - 4.33 * p.ageYears;
}

/** peso × (1 − %grasa/100) */
export function leanBodyMassKg(weightKg: number, bodyFatPercent: number): number {
  return weightKg * (1 - bodyFatPercent / 100);
}

/** 370 + 21.6 × masa magra */
export function katchMcArdleBmr(leanMassKg: number): number {
  return 370 + 21.6 * leanMassKg;
}

/** 500 + 22 × masa magra */
export function cunninghamBmr(leanMassKg: number): number {
  return 500 + 22 * leanMassKg;
}

/** TMB × factor */
export function totalEnergyExpenditure(bmrKcal: number, activityFactor: number): number {
  return bmrKcal * activityFactor;
}

/** GET × (1 + ajuste/100) */
export function applyGoalAdjustment(totalExpenditureKcal: number, adjustmentPercent: number): number {
  return totalExpenditureKcal * (1 + adjustmentPercent / 100);
}

// ── Ajuste por objetivo (D9) ──

/** Extremos del rango ordenados del más cercano a 0 al más lejano. */
function rangeEndsFromZero(range: GoalAdjustmentRange): [number, number] {
  return Math.abs(range.minPercent) <= Math.abs(range.maxPercent)
    ? [range.minPercent, range.maxPercent]
    : [range.maxPercent, range.minPercent];
}

/** Punto medio redondeado "hacia afuera": sign × Math.round(|(min+max)/2|).
 *  MODERATE_DEFICIT −20, AGGRESSIVE_DEFICIT −28, MAINTENANCE 0, SURPLUS 15. */
export function defaultAdjustmentPercent(range: GoalAdjustmentRange): number {
  const mid = (range.minPercent + range.maxPercent) / 2;
  const rounded = Math.sign(mid) * Math.round(Math.abs(mid));
  return rounded === 0 ? 0 : rounded; // evita -0
}

/** "Déficit moderado (−15 a −25 %)", "Déficit agresivo (−25 a −30 %)", "Superávit (+10 a +20 %)",
 *  "Mantenimiento (0 %)". Los extremos van del más cercano a 0 al más lejano. */
export function adjustmentRangeOptionLabel(range: GoalAdjustmentRange): string {
  if (range.minPercent === range.maxPercent) {
    return `${range.shortLabel} (${formatSignedPercentEs(range.minPercent)})`;
  }
  const [near, far] = rangeEndsFromZero(range);
  return `${range.shortLabel} (${formatSignedIntEs(near)} a ${formatSignedPercentEs(far)})`;
}

/** Ayuda del campo "Ajuste": "Entre −15 % y −25 %". */
export function adjustmentRangeHint(range: GoalAdjustmentRange): string {
  const [near, far] = rangeEndsFromZero(range);
  return `Entre ${formatSignedPercentEs(near)} y ${formatSignedPercentEs(far)}`;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLocaleLowerCase("es-AR") + text.slice(1);
}

// ── Macros ──
export const KCAL_PER_GRAM = { protein: 4, fat: 9, carb: 4 } as const;
export const MACRO_REFERENCE = {
  proteinPercent: { min: 15, max: 25 },
  fatPercent: { min: 20, max: 35 },
  carbPercent: { min: 45, max: 60 },
  proteinGPerKg: { min: 1.2, max: 2.2 },
} as const;
export const MACRO_INPUT_BOUNDS = { percent: { min: 0, max: 100 }, proteinGPerKg: { min: 0.5, max: 4 } } as const;
export const PRESCRIBED_VCT_BOUNDS = { min: 800, max: 6000 } as const;
export const DEFAULT_MACRO_PERCENTS = { proteinPercent: 20, fatPercent: 30, carbPercent: 50 } as const;
/** Arranque en GAIN_MUSCLE (D9). */
export const DEFAULT_PROTEIN_G_PER_KG = 1.6;

export type MacroMode = "PERCENT_OF_VCT" | "PROTEIN_PER_KG";
export const MACRO_MODE_VALUES = ["PERCENT_OF_VCT", "PROTEIN_PER_KG"] as const satisfies readonly MacroMode[];
export type MacroChoices =
  | { mode: "PERCENT_OF_VCT"; proteinPercent: number; fatPercent: number; carbPercent: number }
  | { mode: "PROTEIN_PER_KG"; proteinGPerKg: number; fatPercent: number };

export type MacroKey = "protein" | "fat" | "carb";
export interface MacroLine {
  key: MacroKey;
  label: "Proteínas" | "Grasas" | "Carbohidratos";
  /** Exactos. */
  percent: number;
  kcal: number;
  grams: number;
  /** Sobre `weightKg` (el peso usado en las fórmulas, D12). */
  gramsPerKg: number;
}
export interface MacroBreakdown {
  /** P, G, C. */
  lines: [MacroLine, MacroLine, MacroLine];
  /** Exacto; en g/kg es 100 salvo carbohidratos negativos. */
  percentSum: number;
  /** Bloqueantes (REQUIREMENT_TEXT). */
  errors: string[];
  /** Fuera de referencia, no bloquean. */
  warnings: string[];
}

export const MACRO_LABELS: Record<MacroKey, MacroLine["label"]> = {
  protein: "Proteínas",
  fat: "Grasas",
  carb: "Carbohidratos",
};

// ── Textos exactos ──
export const REQUIREMENT_TEXT = {
  activityMissing: "Elegí el nivel de actividad",
  goalMissing: "Elegí el objetivo",
  rangeMissing: "Elegí el tipo de ajuste",
  adjustmentMissing: "Ingresá el ajuste",
  adjustmentNotInteger: "El ajuste tiene que ser un número entero",
  /** "El ajuste para déficit moderado va de −15 % a −25 %" (extremos de cerca de 0 a lejos). */
  adjustmentOutOfRange: (range: GoalAdjustmentRange): string => {
    const who = lowerFirst(range.shortLabel);
    if (range.minPercent === range.maxPercent) {
      return `El ajuste para ${who} es ${formatSignedPercentEs(range.minPercent)}`;
    }
    const [near, far] = rangeEndsFromZero(range);
    return `El ajuste para ${who} va de ${formatSignedPercentEs(near)} a ${formatSignedPercentEs(far)}`;
  },
  bodyFatNeeded: "La fórmula elegida necesita el % de grasa",
  vctMissing: "Ingresá el VCT indicado",
  vctOutOfRange: "El VCT indicado va de 800 a 6.000 kcal",
  vctNotInteger: "El VCT indicado tiene que ser un número entero",
  percentOutOfBounds: "Cada porcentaje va de 0 a 100 %",
  percentDecimals: "Los porcentajes admiten un decimal",
  /** "Los porcentajes suman 95 %; tienen que sumar 100 %" */
  percentSum: (sum: number): string =>
    `Los porcentajes suman ${formatDecimalEs(roundTo(sum, 1), 1)} %; tienen que sumar 100 %`,
  proteinGPerKgOutOfBounds: "La proteína va de 0,5 a 4 g/kg",
  proteinGPerKgDecimals: "La proteína en g/kg admite un decimal",
  negativeCarbs: "Proteínas y grasas superan el VCT indicado: los carbohidratos quedan en negativo",
  /** "Carbohidratos 41,3 %: fuera del rango de referencia (45–60 %)" */
  macroPercentWarning: (label: string, percent: number, min: number, max: number): string =>
    `${label} ${formatDecimalEs(roundTo(percent, 1), 1)} %: fuera del rango de referencia (${formatDecimalEs(min)}–${formatDecimalEs(max)} %)`,
  /** "Proteínas 2,5 g/kg: fuera del rango de referencia (1,2–2,2 g/kg)" */
  proteinGPerKgWarning: (gPerKg: number): string =>
    `Proteínas ${formatDecimalEs(roundTo(gPerKg, 1), 1)} g/kg: fuera del rango de referencia (${formatDecimalEs(MACRO_REFERENCE.proteinGPerKg.min)}–${formatDecimalEs(MACRO_REFERENCE.proteinGPerKg.max)} g/kg)`,
  saved: "Prescripción guardada",
  deleted: "Prescripción borrada",
  invalid: "Datos inválidos",
  emptyInConsultation: "Todavía no hay un requerimiento indicado en esta consulta.",
  emptyInSummary: "Todavía no hay un requerimiento indicado. Se calcula en una consulta.",
  noBodyFat: "Sin % de grasa medido",
  deleteConfirmTitle: "¿Borrar la prescripción de esta consulta?",
  deleteConfirmDescription: "No se puede deshacer.",
} as const;

function hasAtMostOneDecimal(value: number): boolean {
  return Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;
}

function isPercentInBounds(value: number): boolean {
  return Number.isFinite(value) && value >= MACRO_INPUT_BOUNDS.percent.min && value <= MACRO_INPUT_BOUNDS.percent.max;
}

function outsideReference(value: number, ref: { min: number; max: number }, decimals = 1): boolean {
  const v = roundTo(value, decimals);
  return v < ref.min || v > ref.max;
}

function macroLine(key: MacroKey, kcal: number, vct: number, weightKg: number): MacroLine {
  const grams = kcal / KCAL_PER_GRAM[key];
  return {
    key,
    label: MACRO_LABELS[key],
    percent: vct > 0 ? (kcal / vct) * 100 : 0,
    kcal,
    grams,
    gramsPerKg: weightKg > 0 ? grams / weightKg : 0,
  };
}

/**
 * % del VCT: kcal = VCT × %/100; g = kcal / kcal-por-gramo.
 * g/kg: proteína g = g/kg × weightKg, kcal = g × 4; grasas kcal = VCT × %/100;
 *       carbohidratos kcal = VCT − proteína − grasas; los % se derivan (kcal / VCT × 100).
 * Warnings (solo si no hay errores): en % del VCT, cada macro con roundTo(percent, 1) fuera de
 * MACRO_REFERENCE (bordes incluidos); en g/kg, la proteína se compara por g/kg y no por %.
 */
export function computeMacros(p: {
  prescribedVctKcal: number;
  weightKg: number;
  macros: MacroChoices;
}): MacroBreakdown {
  const vct = p.prescribedVctKcal;
  const errors: string[] = [];
  const warnings: string[] = [];
  let lines: [MacroLine, MacroLine, MacroLine];

  if (p.macros.mode === "PERCENT_OF_VCT") {
    const { proteinPercent, fatPercent, carbPercent } = p.macros;
    const inputs = [proteinPercent, fatPercent, carbPercent];
    if (!inputs.every(isPercentInBounds)) errors.push(REQUIREMENT_TEXT.percentOutOfBounds);
    else if (!inputs.every(hasAtMostOneDecimal)) errors.push(REQUIREMENT_TEXT.percentDecimals);
    const sum = proteinPercent + fatPercent + carbPercent;
    if (Number.isFinite(sum) && roundTo(sum, 1) !== 100) errors.push(REQUIREMENT_TEXT.percentSum(sum));
    lines = [
      macroLine("protein", (vct * proteinPercent) / 100, vct, p.weightKg),
      macroLine("fat", (vct * fatPercent) / 100, vct, p.weightKg),
      macroLine("carb", (vct * carbPercent) / 100, vct, p.weightKg),
    ];
    // En % del VCT el % es el ingresado (sin pasar por kcal / VCT).
    lines[0].percent = proteinPercent;
    lines[1].percent = fatPercent;
    lines[2].percent = carbPercent;
  } else {
    const { proteinGPerKg, fatPercent } = p.macros;
    const { min, max } = MACRO_INPUT_BOUNDS.proteinGPerKg;
    if (!Number.isFinite(proteinGPerKg) || proteinGPerKg < min || proteinGPerKg > max) {
      errors.push(REQUIREMENT_TEXT.proteinGPerKgOutOfBounds);
    } else if (!hasAtMostOneDecimal(proteinGPerKg)) {
      errors.push(REQUIREMENT_TEXT.proteinGPerKgDecimals);
    }
    if (!isPercentInBounds(fatPercent)) errors.push(REQUIREMENT_TEXT.percentOutOfBounds);
    else if (!hasAtMostOneDecimal(fatPercent)) errors.push(REQUIREMENT_TEXT.percentDecimals);
    const proteinKcal = proteinGPerKg * p.weightKg * KCAL_PER_GRAM.protein;
    const fatKcal = (vct * fatPercent) / 100;
    const carbKcal = vct - proteinKcal - fatKcal;
    if (carbKcal < 0) errors.push(REQUIREMENT_TEXT.negativeCarbs);
    lines = [
      macroLine("protein", proteinKcal, vct, p.weightKg),
      macroLine("fat", fatKcal, vct, p.weightKg),
      macroLine("carb", carbKcal, vct, p.weightKg),
    ];
  }

  const percentSum = lines[0].percent + lines[1].percent + lines[2].percent;

  if (errors.length === 0) {
    const [protein, fat, carb] = lines;
    if (p.macros.mode === "PERCENT_OF_VCT") {
      const ref = MACRO_REFERENCE.proteinPercent;
      if (outsideReference(protein.percent, ref)) {
        warnings.push(REQUIREMENT_TEXT.macroPercentWarning(protein.label, protein.percent, ref.min, ref.max));
      }
    } else if (outsideReference(p.macros.proteinGPerKg, MACRO_REFERENCE.proteinGPerKg)) {
      warnings.push(REQUIREMENT_TEXT.proteinGPerKgWarning(p.macros.proteinGPerKg));
    }
    const fatRef = MACRO_REFERENCE.fatPercent;
    if (outsideReference(fat.percent, fatRef)) {
      warnings.push(REQUIREMENT_TEXT.macroPercentWarning(fat.label, fat.percent, fatRef.min, fatRef.max));
    }
    const carbRef = MACRO_REFERENCE.carbPercent;
    if (outsideReference(carb.percent, carbRef)) {
      warnings.push(REQUIREMENT_TEXT.macroPercentWarning(carb.label, carb.percent, carbRef.min, carbRef.max));
    }
  }

  return { lines, percentSum, errors, warnings };
}

// ── Calculadora completa ──
export type WeightBasis = "ACTUAL" | "ADJUSTED";
export type BodyFatSource = "MEASURED" | "DEURENBERG";
export const WEIGHT_BASIS_VALUES = ["ACTUAL", "ADJUSTED"] as const satisfies readonly WeightBasis[];
export const BODY_FAT_SOURCE_VALUES = ["MEASURED", "DEURENBERG"] as const satisfies readonly BodyFatSource[];

/** Datos de entrada que no elige la profesional (salen del paciente y de las mediciones, D4). Adulto. */
export interface RequirementContext {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  actualWeightKg: number;
  measuredBodyFatPercent: number | null;
}

/** Lo que elige en la calculadora. Los null son "todavía no eligió" (bloquean guardar). */
export interface RequirementDraft {
  bmrFormula: BmrFormula;
  weightBasis: WeightBasis;
  bodyFatSource: BodyFatSource | null;
  activityLevel: ActivityLevel | null;
  nutritionGoal: NutritionGoal | null;
  adjustmentRange: AdjustmentRangeKey | null;
  adjustmentPercent: number | null;
  prescribedVctKcal: number | null;
  macros: MacroChoices;
}

/** Igual que el draft, sin null salvo bodyFatSource. Es lo que valida zod en el servidor. */
export type PrescriptionChoices = Omit<
  RequirementDraft,
  "activityLevel" | "nutritionGoal" | "adjustmentRange" | "adjustmentPercent" | "prescribedVctKcal"
> & {
  activityLevel: ActivityLevel;
  nutritionGoal: NutritionGoal;
  adjustmentRange: AdjustmentRangeKey;
  adjustmentPercent: number;
  prescribedVctKcal: number;
};

export interface RequirementCalculation {
  idealWeightDevineKg: number;
  adjustedWeightKg: number;
  suggestAdjustedWeight: boolean;
  /** Actual o ajustado según weightBasis. */
  weightUsedKg: number;
  /** El de bodyFatSource: medido, Deurenberg o null. */
  bodyFatPercent: number | null;
  /** Siempre (el botón "Usar el estimado" lo muestra). */
  deurenbergBodyFatPercent: number;
  /** Mifflin/HB con weightUsedKg; Katch/Cunningham con la masa magra del PESO ACTUAL. */
  bmrByFormula: Record<BmrFormula, number | null>;
  bmrKcal: number | null;
  activityFactor: number | null;
  totalExpenditureKcal: number | null;
  calculatedVctKcal: number | null;
  /** null si prescribedVctKcal es null. */
  macros: MacroBreakdown | null;
  errors: string[];
  warnings: string[];
}

export function calculateRequirement(ctx: RequirementContext, draft: RequirementDraft): RequirementCalculation {
  const errors: string[] = [];

  // 1–2. Peso
  const idealWeightDevineKg = devineIdealWeightKg(ctx.sex, ctx.heightCm);
  const adjusted = adjustedWeightKg(ctx.actualWeightKg, idealWeightDevineKg);
  const suggestAdjustedWeight = shouldSuggestAdjustedWeight(ctx.actualWeightKg, idealWeightDevineKg);
  const weightUsedKg = draft.weightBasis === "ADJUSTED" ? adjusted : ctx.actualWeightKg;

  // 3. % de grasa
  const deurenberg = deurenbergBodyFatPercent({
    bmi: bmiExact(ctx.actualWeightKg, ctx.heightCm),
    ageYears: ctx.ageYears,
    sex: ctx.sex,
  });
  const bodyFatPercent =
    draft.bodyFatSource === "MEASURED"
      ? ctx.measuredBodyFatPercent
      : draft.bodyFatSource === "DEURENBERG"
        ? deurenberg
        : null;

  // 4. TMB
  const person: BmrPersonInput = {
    sex: ctx.sex,
    weightKg: weightUsedKg,
    heightCm: ctx.heightCm,
    ageYears: ctx.ageYears,
  };
  const leanMass = bodyFatPercent === null ? null : leanBodyMassKg(ctx.actualWeightKg, bodyFatPercent);
  const bmrByFormula: Record<BmrFormula, number | null> = {
    MIFFLIN_ST_JEOR: mifflinStJeorBmr(person),
    HARRIS_BENEDICT: harrisBenedictBmr(person),
    KATCH_MCARDLE: leanMass === null ? null : katchMcArdleBmr(leanMass),
    CUNNINGHAM: leanMass === null ? null : cunninghamBmr(leanMass),
  };
  const bmrKcal = bmrByFormula[draft.bmrFormula];
  if (bmrKcal === null) errors.push(REQUIREMENT_TEXT.bodyFatNeeded);

  // 5. Actividad, objetivo, rango y ajuste
  const activity = activityLevelOption(draft.activityLevel);
  if (activity === null) errors.push(REQUIREMENT_TEXT.activityMissing);
  let validAdjustment: number | null = null;
  if (draft.nutritionGoal === null) {
    errors.push(REQUIREMENT_TEXT.goalMissing);
  } else {
    const range =
      draft.adjustmentRange === null ? null : goalAdjustmentRange(draft.nutritionGoal, draft.adjustmentRange);
    if (range === null) {
      errors.push(REQUIREMENT_TEXT.rangeMissing);
    } else if (draft.adjustmentPercent === null || !Number.isFinite(draft.adjustmentPercent)) {
      errors.push(REQUIREMENT_TEXT.adjustmentMissing);
    } else if (!Number.isInteger(draft.adjustmentPercent)) {
      errors.push(REQUIREMENT_TEXT.adjustmentNotInteger);
    } else if (draft.adjustmentPercent < range.minPercent || draft.adjustmentPercent > range.maxPercent) {
      errors.push(REQUIREMENT_TEXT.adjustmentOutOfRange(range));
    } else {
      validAdjustment = draft.adjustmentPercent;
    }
  }

  // 6. GET y VCT calculado
  const activityFactor = activity?.factor ?? null;
  const totalExpenditureKcal =
    bmrKcal !== null && activityFactor !== null ? totalEnergyExpenditure(bmrKcal, activityFactor) : null;
  const calculatedVctKcal =
    totalExpenditureKcal !== null && validAdjustment !== null
      ? applyGoalAdjustment(totalExpenditureKcal, validAdjustment)
      : null;

  // 7. VCT indicado
  const vct = draft.prescribedVctKcal;
  if (vct === null || !Number.isFinite(vct)) errors.push(REQUIREMENT_TEXT.vctMissing);
  else if (!Number.isInteger(vct)) errors.push(REQUIREMENT_TEXT.vctNotInteger);
  else if (vct < PRESCRIBED_VCT_BOUNDS.min || vct > PRESCRIBED_VCT_BOUNDS.max) {
    errors.push(REQUIREMENT_TEXT.vctOutOfRange);
  }

  // 8. Macros sobre el VCT indicado
  const macros =
    vct === null || !Number.isFinite(vct)
      ? null
      : computeMacros({ prescribedVctKcal: vct, weightKg: weightUsedKg, macros: draft.macros });
  if (macros) errors.push(...macros.errors);

  return {
    idealWeightDevineKg,
    adjustedWeightKg: adjusted,
    suggestAdjustedWeight,
    weightUsedKg,
    bodyFatPercent,
    deurenbergBodyFatPercent: deurenberg,
    bmrByFormula,
    bmrKcal,
    activityFactor,
    totalExpenditureKcal,
    calculatedVctKcal,
    macros,
    errors,
    warnings: macros?.warnings ?? [],
  };
}

/** Valores tal como se guardan (redondeados). Nombres = columnas de NutritionPrescription. */
export interface PrescriptionSnapshot {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  actualWeightKg: number;
  /** roundTo 2 */
  idealWeightDevineKg: number;
  weightBasis: WeightBasis;
  /** roundTo 2 */
  weightUsedKg: number;
  /** roundTo 1 */
  bodyFatPercent: number | null;
  bodyFatSource: BodyFatSource | null;
  bmrFormula: BmrFormula;
  /** Math.round */
  bmrKcal: number;
  bmrMifflinStJeorKcal: number;
  bmrHarrisBenedictKcal: number;
  bmrKatchMcArdleKcal: number | null;
  bmrCunninghamKcal: number | null;
  activityLevel: ActivityLevel;
  activityFactor: number;
  totalExpenditureKcal: number;
  nutritionGoal: NutritionGoal;
  adjustmentRange: AdjustmentRangeKey;
  adjustmentPercent: number;
  calculatedVctKcal: number;
  prescribedVctKcal: number;
  macroMode: MacroMode;
  /** roundTo 1 (en % del VCT, los ingresados). */
  proteinPercent: number;
  fatPercent: number;
  carbPercent: number;
  proteinGPerKg: number | null;
  /** Math.round */
  proteinG: number;
  fatG: number;
  carbG: number;
}

const roundOrNull = (value: number | null): number | null => (value === null ? null : Math.round(value));

/** calculateRequirement + errores → { ok: false, errors }. */
export function buildPrescriptionSnapshot(
  ctx: RequirementContext,
  choices: PrescriptionChoices,
): { ok: true; snapshot: PrescriptionSnapshot } | { ok: false; errors: string[] } {
  const calc = calculateRequirement(ctx, choices);
  if (
    calc.errors.length > 0 ||
    calc.bmrKcal === null ||
    calc.activityFactor === null ||
    calc.totalExpenditureKcal === null ||
    calc.calculatedVctKcal === null ||
    calc.macros === null
  ) {
    return { ok: false, errors: calc.errors.length > 0 ? calc.errors : [REQUIREMENT_TEXT.invalid] };
  }
  const [protein, fat, carb] = calc.macros.lines;
  return {
    ok: true,
    snapshot: {
      sex: ctx.sex,
      ageYears: ctx.ageYears,
      heightCm: roundTo(ctx.heightCm, 2),
      actualWeightKg: roundTo(ctx.actualWeightKg, 2),
      idealWeightDevineKg: roundTo(calc.idealWeightDevineKg, 2),
      weightBasis: choices.weightBasis,
      weightUsedKg: roundTo(calc.weightUsedKg, 2),
      bodyFatPercent: calc.bodyFatPercent === null ? null : roundTo(calc.bodyFatPercent, 1),
      bodyFatSource: calc.bodyFatPercent === null ? null : choices.bodyFatSource,
      bmrFormula: choices.bmrFormula,
      bmrKcal: Math.round(calc.bmrKcal),
      bmrMifflinStJeorKcal: Math.round(calc.bmrByFormula.MIFFLIN_ST_JEOR!),
      bmrHarrisBenedictKcal: Math.round(calc.bmrByFormula.HARRIS_BENEDICT!),
      bmrKatchMcArdleKcal: roundOrNull(calc.bmrByFormula.KATCH_MCARDLE),
      bmrCunninghamKcal: roundOrNull(calc.bmrByFormula.CUNNINGHAM),
      activityLevel: choices.activityLevel,
      activityFactor: calc.activityFactor,
      totalExpenditureKcal: Math.round(calc.totalExpenditureKcal),
      nutritionGoal: choices.nutritionGoal,
      adjustmentRange: choices.adjustmentRange,
      adjustmentPercent: choices.adjustmentPercent,
      calculatedVctKcal: Math.round(calc.calculatedVctKcal),
      prescribedVctKcal: choices.prescribedVctKcal,
      macroMode: choices.macros.mode,
      proteinPercent: roundTo(protein.percent, 1),
      fatPercent: roundTo(fat.percent, 1),
      carbPercent: roundTo(carb.percent, 1),
      proteinGPerKg: choices.macros.mode === "PROTEIN_PER_KG" ? roundTo(choices.macros.proteinGPerKg, 1) : null,
      proteinG: Math.round(protein.grams),
      fatG: Math.round(fat.grams),
      carbG: Math.round(carb.grams),
    },
  };
}

// ── Valores iniciales de la calculadora (D1, D9, D12) ──

/** Lo mínimo de la prescripción anterior del paciente. */
export interface ReferencePrescription {
  bmrFormula: BmrFormula;
  adjustmentRange: AdjustmentRangeKey;
  adjustmentPercent: number;
  macroMode: MacroMode;
  proteinPercent: number;
  fatPercent: number;
  carbPercent: number;
  proteinGPerKg: number | null;
}

function macrosFromReference(ref: ReferencePrescription): MacroChoices {
  if (ref.macroMode === "PROTEIN_PER_KG") {
    return {
      mode: "PROTEIN_PER_KG",
      proteinGPerKg: ref.proteinGPerKg ?? DEFAULT_PROTEIN_G_PER_KG,
      fatPercent: ref.fatPercent,
    };
  }
  return {
    mode: "PERCENT_OF_VCT",
    proteinPercent: ref.proteinPercent,
    fatPercent: ref.fatPercent,
    carbPercent: ref.carbPercent,
  };
}

function defaultMacros(goal: NutritionGoal | null): MacroChoices {
  if (goal === "GAIN_MUSCLE") {
    return {
      mode: "PROTEIN_PER_KG",
      proteinGPerKg: DEFAULT_PROTEIN_G_PER_KG,
      fatPercent: DEFAULT_MACRO_PERCENTS.fatPercent,
    };
  }
  return { mode: "PERCENT_OF_VCT", ...DEFAULT_MACRO_PERCENTS };
}

/** Rango inicial de un objetivo: el único si hay uno; si hay varios, el preferido si es del
 *  objetivo, si no el primero. null sin objetivo. */
export function initialAdjustmentRange(
  goal: NutritionGoal | null,
  preferred: AdjustmentRangeKey | null,
): GoalAdjustmentRange | null {
  if (goal === null) return null;
  const ranges = NUTRITION_GOALS.find((g) => g.value === goal)?.adjustmentRanges ?? [];
  if (ranges.length === 0) return null;
  if (ranges.length === 1) return ranges[0]!;
  return ranges.find((r) => r.key === preferred) ?? ranges[0]!;
}

/**
 * - bmrFormula: la de `reference` (D1); si necesita % de grasa y no hay medido, Mifflin.
 * - weightBasis: ADJUSTED si suggestAdjustedWeight, si no ACTUAL.
 * - bodyFatSource: MEASURED si hay % medido, si no null.
 * - activityLevel / nutritionGoal: los del paciente (pueden ser null, D10).
 * - adjustmentRange / adjustmentPercent: ver initialAdjustmentRange; el % de la referencia si el
 *   rango coincide, si no defaultAdjustmentPercent.
 * - prescribedVctKcal: null (la UI lo iguala al calculado redondeado mientras no lo toquen).
 * - macros: los de la referencia; si no hay, GAIN_MUSCLE → g/kg 1,6 + grasas 30; el resto 20/30/50.
 */
export function initialRequirementDraft(p: {
  ctx: RequirementContext;
  patientActivityLevel: ActivityLevel | null;
  patientNutritionGoal: NutritionGoal | null;
  reference: ReferencePrescription | null;
}): RequirementDraft {
  const { ctx, reference } = p;
  const hasMeasuredBodyFat = ctx.measuredBodyFatPercent !== null;
  let bmrFormula = reference?.bmrFormula ?? DEFAULT_BMR_FORMULA;
  if (bmrFormulaOption(bmrFormula).needsBodyFat && !hasMeasuredBodyFat) bmrFormula = DEFAULT_BMR_FORMULA;

  const ideal = devineIdealWeightKg(ctx.sex, ctx.heightCm);
  const range = initialAdjustmentRange(p.patientNutritionGoal, reference?.adjustmentRange ?? null);
  const adjustmentPercent =
    range === null
      ? null
      : reference !== null && reference.adjustmentRange === range.key
        ? reference.adjustmentPercent
        : defaultAdjustmentPercent(range);

  return {
    bmrFormula,
    weightBasis: shouldSuggestAdjustedWeight(ctx.actualWeightKg, ideal) ? "ADJUSTED" : "ACTUAL",
    bodyFatSource: hasMeasuredBodyFat ? "MEASURED" : null,
    activityLevel: p.patientActivityLevel,
    nutritionGoal: p.patientNutritionGoal,
    adjustmentRange: range?.key ?? null,
    adjustmentPercent,
    prescribedVctKcal: null,
    macros: reference !== null ? macrosFromReference(reference) : defaultMacros(p.patientNutritionGoal),
  };
}

/** Borrador desde una prescripción guardada ("Editar"). bodyFatSource MEASURED sin medido hoy → null. */
export function draftFromPrescription(p: PrescriptionSnapshot, ctx: RequirementContext): RequirementDraft {
  const bodyFatSource =
    p.bodyFatSource === "MEASURED" && ctx.measuredBodyFatPercent === null ? null : p.bodyFatSource;
  return {
    bmrFormula: p.bmrFormula,
    weightBasis: p.weightBasis,
    bodyFatSource,
    activityLevel: p.activityLevel,
    nutritionGoal: p.nutritionGoal,
    adjustmentRange: p.adjustmentRange,
    adjustmentPercent: p.adjustmentPercent,
    prescribedVctKcal: p.prescribedVctKcal,
    macros:
      p.macroMode === "PROTEIN_PER_KG"
        ? { mode: "PROTEIN_PER_KG", proteinGPerKg: p.proteinGPerKg ?? DEFAULT_PROTEIN_G_PER_KG, fatPercent: p.fatPercent }
        : { mode: "PERCENT_OF_VCT", proteinPercent: p.proteinPercent, fatPercent: p.fatPercent, carbPercent: p.carbPercent },
  };
}

const REQUIREMENT_BLOCKING_KEYS = new Set(["sex", "birthDate", "weight", "height"]);

/** Bloqueantes para el requerimiento: getMissingFormulaData filtrado a sex, birthDate, weight, height
 *  (actividad y objetivo NO bloquean: se eligen en la calculadora). */
export function getRequirementBlockingMissing(input: FormulaDataPresence): MissingFormulaDataItem[] {
  return getMissingFormulaData(input).filter((item) => REQUIREMENT_BLOCKING_KEYS.has(item.key));
}

// ── Textos de resumen (tarjetas "Requerimiento" y "Requerimiento indicado") ──

/** "VCT 1.481 kcal · P 74 g · G 49 g · C 185 g" */
export function prescriptionHeadline(
  p: Pick<PrescriptionSnapshot, "prescribedVctKcal" | "proteinG" | "fatG" | "carbG">,
): string {
  return [
    `VCT ${formatMacroAmount(p.prescribedVctKcal, "kcal")}`,
    `P ${formatMacroAmount(p.proteinG, "g")}`,
    `G ${formatMacroAmount(p.fatG, "g")}`,
    `C ${formatMacroAmount(p.carbG, "g")}`,
  ].join(" · ");
}

/** "Mifflin-St Jeor · TMB 1.347 kcal · Ligero ×1,375 · GET 1.851 kcal · Déficit moderado −20 %"
 *  (con MAINTENANCE el último tramo es "Mantenimiento", sin %). */
export function prescriptionFormulaLine(p: PrescriptionSnapshot): string {
  const activity = activityLevelOption(p.activityLevel);
  const range = goalAdjustmentRange(p.nutritionGoal, p.adjustmentRange);
  const rangeLabel = range?.shortLabel ?? "";
  const adjustment =
    p.adjustmentRange === "MAINTENANCE" ? rangeLabel : `${rangeLabel} ${formatSignedPercentEs(p.adjustmentPercent)}`;
  return [
    bmrFormulaOption(p.bmrFormula).label,
    `TMB ${formatMacroAmount(p.bmrKcal, "kcal")}`,
    `${activity?.label ?? ""} ×${formatDecimalEs(p.activityFactor)}`,
    `GET ${formatMacroAmount(p.totalExpenditureKcal, "kcal")}`,
    adjustment,
  ].join(" · ");
}

const oneDecimalFixed = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** kg con 1 decimal fijo: 75 → "75,0". */
export function formatKgFixed1(value: number): string {
  return oneDecimalFixed.format(value);
}

/** "Peso usado: 66,5 kg (actual)" | "Peso usado: 85,7 kg (ajustado; ideal Devine 75,0 kg)". */
export function prescriptionWeightLine(p: PrescriptionSnapshot): string {
  if (p.weightBasis === "ADJUSTED") {
    return `Peso usado: ${formatKgFixed1(p.weightUsedKg)} kg (ajustado; ideal Devine ${formatKgFixed1(p.idealWeightDevineKg)} kg)`;
  }
  return `Peso usado: ${formatKgFixed1(p.weightUsedKg)} kg (actual)`;
}

/** "−119 kcal respecto del 12/08/2026" | "+50 kcal respecto del …" | "Igual que el 12/08/2026". */
export function prescriptionDiffText(currentKcal: number, previousKcal: number, previousDateLabel: string): string {
  const diff = Math.round(currentKcal) - Math.round(previousKcal);
  if (diff === 0) return `Igual que el ${previousDateLabel}`;
  return `${formatSignedIntEs(diff)}${NBSP}kcal respecto del ${previousDateLabel}`;
}

/** "Difiere del calculado en +19 kcal". */
export function vctDifferenceText(prescribedKcal: number, calculatedKcal: number): string {
  return `Difiere del calculado en ${formatSignedIntEs(Math.round(prescribedKcal) - Math.round(calculatedKcal))}${NBSP}kcal`;
}
