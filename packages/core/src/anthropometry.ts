import { BODY_FRAMES, formatDecimalEs, type BodyFrame, type Sex } from "./patient-formula-data";

const roundToOne = (value: number) => Math.round(value * 10) / 10;
const roundToTwo = (value: number) => Math.round(value * 100) / 100;

/** IMC = peso(kg) / altura(m)^2. Redondeado a 1 decimal. */
export function computeBmi(
  weightKg: number | null | undefined,
  heightCm: number | null | undefined,
): number | null {
  if (weightKg == null || heightCm == null || weightKg <= 0 || heightCm <= 0) return null;
  const heightM = heightCm / 100;
  return roundToOne(weightKg / (heightM * heightM));
}

/** Índice cintura/cadera. Redondeado a 2 decimales. */
export function computeWaistHipRatio(
  waistCm: number | null | undefined,
  hipCm: number | null | undefined,
): number | null {
  if (waistCm == null || hipCm == null || waistCm <= 0 || hipCm <= 0) return null;
  return roundToTwo(waistCm / hipCm);
}

// ─── HU-004: diagnóstico antropométrico ──────────────────────────────────────
// Las funciones de fórmula devuelven el valor exacto; el redondeo es solo para mostrar o
// guardar (roundTo). Las clasificaciones usan el valor ya redondeado a lo que se muestra.

/** Math.round(value * 10^d) / 10^d. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** IMC exacto, sin redondear: peso(kg) / (talla(cm)/100)². Para Deurenberg y clasificar. */
export function bmiExact(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

// ── IMC (OMS) ──
export type BmiClass = "UNDERWEIGHT" | "NORMAL" | "OVERWEIGHT" | "OBESITY_I" | "OBESITY_II" | "OBESITY_III";
export const BMI_CLASS_LABELS: Record<BmiClass, string> = {
  UNDERWEIGHT: "Bajo peso",
  NORMAL: "Normal",
  OVERWEIGHT: "Sobrepeso",
  OBESITY_I: "Obesidad grado I",
  OBESITY_II: "Obesidad grado II",
  OBESITY_III: "Obesidad grado III",
};
export const BMI_HEALTHY_RANGE_TEXT = "18,5–24,9";

/** `bmi` redondeado a 1 decimal. < 18.5, < 25, < 30, < 35, < 40, resto. */
export function classifyBmi(bmi: number): BmiClass {
  const v = roundTo(bmi, 1);
  if (v < 18.5) return "UNDERWEIGHT";
  if (v < 25) return "NORMAL";
  if (v < 30) return "OVERWEIGHT";
  if (v < 35) return "OBESITY_I";
  if (v < 40) return "OBESITY_II";
  return "OBESITY_III";
}

// ── Cintura (riesgo cardiometabólico) ──
export type WaistRisk = "NO_RISK" | "ELEVATED" | "VERY_ELEVATED";
export const WAIST_RISK_LABELS: Record<WaistRisk, string> = {
  NO_RISK: "Sin riesgo aumentado",
  ELEVATED: "Riesgo elevado",
  VERY_ELEVATED: "Riesgo muy elevado",
};
export const WAIST_RISK_THRESHOLDS_CM: Record<Sex, { elevated: number; veryElevated: number }> = {
  MALE: { elevated: 94, veryElevated: 102 },
  FEMALE: { elevated: 80, veryElevated: 88 },
};

/** Comparación >= con los umbrales del sexo. La cintura se clasifica con el valor medido. */
export function classifyWaist(sex: Sex, waistCm: number): WaistRisk {
  const t = WAIST_RISK_THRESHOLDS_CM[sex];
  if (waistCm >= t.veryElevated) return "VERY_ELEVATED";
  if (waistCm >= t.elevated) return "ELEVATED";
  return "NO_RISK";
}

// ── ICC (D3: umbrales OMS por sexo) ──
export type WaistHipRisk = "NO_RISK" | "INCREASED";
export const WAIST_HIP_RISK_LABELS: Record<WaistHipRisk, string> = {
  NO_RISK: "Sin riesgo aumentado",
  INCREASED: "Riesgo aumentado",
};
export const WAIST_HIP_RISK_THRESHOLD: Record<Sex, number> = { MALE: 0.9, FEMALE: 0.85 };

/** `ratio` redondeado a 2 decimales. Riesgo si supera el umbral (estricto). */
export function classifyWaistHipRatio(sex: Sex, ratio: number): WaistHipRisk {
  return roundTo(ratio, 2) > WAIST_HIP_RISK_THRESHOLD[sex] ? "INCREASED" : "NO_RISK";
}

/** "riesgo aumentado > 0,85 en mujeres" / "riesgo aumentado > 0,9 en hombres". */
export function waistHipThresholdText(sex: Sex): string {
  const who = sex === "MALE" ? "hombres" : "mujeres";
  return `riesgo aumentado > ${formatDecimalEs(WAIST_HIP_RISK_THRESHOLD[sex])} en ${who}`;
}

// ── Índices de salud (D6, rangos de ISAKMetry) ──
export type HealthyRangeClass = "HEALTHY" | "OUT_OF_RANGE";
export const HEALTHY_RANGE_LABELS: Record<HealthyRangeClass, string> = {
  HEALTHY: "En rango saludable",
  OUT_OF_RANGE: "Fuera del rango saludable",
};
export const WAIST_TO_HEIGHT_HEALTHY_MAX = 0.5;
export const CONICITY_HEALTHY_MAX = 1.4;

/** cintura(cm) / talla(cm), exacto. */
export function waistToHeightRatio(waistCm: number, heightCm: number): number {
  return waistCm / heightCm;
}

/** (cintura(cm)/100) / (0.109 × √(peso(kg) / (talla(cm)/100))), exacto. */
export function conicityIndex(waistCm: number, weightKg: number, heightCm: number): number {
  return waistCm / 100 / (0.109 * Math.sqrt(weightKg / (heightCm / 100)));
}

/** value redondeado a 2 decimales; HEALTHY si value < max. */
export function classifyHealthyBelow(value: number, max: number): HealthyRangeClass {
  return roundTo(value, 2) < max ? "HEALTHY" : "OUT_OF_RANGE";
}

// ── % de grasa estimado ──
/** Deurenberg: 1.20·IMC + 0.23·edad − 10.8·(MALE ? 1 : 0) − 5.4. `bmi` exacto (bmiExact). */
export function deurenbergBodyFatPercent(p: { bmi: number; ageYears: number; sex: Sex }): number {
  return 1.2 * p.bmi + 0.23 * p.ageYears - 10.8 * (p.sex === "MALE" ? 1 : 0) - 5.4;
}

// ── Peso ideal (kg, exacto) ──
export type IdealWeightFormula = "DEVINE" | "HAMWI" | "BROCA" | "BROCA_BRUGSCH" | "LORENTZ";
export const IDEAL_WEIGHT_FORMULA_LABELS: Record<IdealWeightFormula, string> = {
  DEVINE: "Devine",
  HAMWI: "Hamwi",
  BROCA: "Broca",
  BROCA_BRUGSCH: "Broca-Brugsch",
  LORENTZ: "Lorentz",
};

/** MALE 50 / FEMALE 45.5 + 2.3 × (talla − 152.4) / 2.54 */
export function devineIdealWeightKg(sex: Sex, heightCm: number): number {
  return (sex === "MALE" ? 50 : 45.5) + (2.3 * (heightCm - 152.4)) / 2.54;
}

/** MALE 48 + 2.7 × (talla/2.54 − 60) / FEMALE 45.5 + 2.2 × (talla/2.54 − 60),
 *  × (1 + hamwiAdjustmentPercent/100) de BODY_FRAMES. */
export function hamwiIdealWeightKg(sex: Sex, heightCm: number, bodyFrame: BodyFrame): number {
  const inchesOver5ft = heightCm / 2.54 - 60;
  const base = sex === "MALE" ? 48 + 2.7 * inchesOver5ft : 45.5 + 2.2 * inchesOver5ft;
  const adjustment = BODY_FRAMES.find((b) => b.value === bodyFrame)?.hamwiAdjustmentPercent ?? 0;
  return base * (1 + adjustment / 100);
}

/** talla − 100 */
export function brocaIdealWeightKg(heightCm: number): number {
  return heightCm - 100;
}

/** (talla − 100) × (MALE 0.90 / FEMALE 0.85) */
export function brocaBrugschIdealWeightKg(sex: Sex, heightCm: number): number {
  return (heightCm - 100) * (sex === "MALE" ? 0.9 : 0.85);
}

/** (talla − 100) − (talla − 150) / (MALE 4 / FEMALE 2.5) */
export function lorentzIdealWeightKg(sex: Sex, heightCm: number): number {
  return heightCm - 100 - (heightCm - 150) / (sex === "MALE" ? 4 : 2.5);
}

// ── Peso ajustado (D2) ──
export const ADJUSTED_WEIGHT_THRESHOLD_PERCENT = 130;

/** ideal + 0.25 × (actual − ideal) */
export function adjustedWeightKg(actualKg: number, idealKg: number): number {
  return idealKg + 0.25 * (actualKg - idealKg);
}

/** actual / ideal × 100 */
export function percentOfIdealWeight(actualKg: number, idealKg: number): number {
  return (actualKg / idealKg) * 100;
}

/** true si roundTo(percentOfIdealWeight, 1) > ADJUSTED_WEIGHT_THRESHOLD_PERCENT (estricto). */
export function shouldSuggestAdjustedWeight(actualKg: number, idealKg: number): boolean {
  return roundTo(percentOfIdealWeight(actualKg, idealKg), 1) > ADJUSTED_WEIGHT_THRESHOLD_PERCENT;
}
