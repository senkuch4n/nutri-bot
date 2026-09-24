import { formatInTimeZone } from "date-fns-tz";

// Datos del paciente que usan las fórmulas (TMB, GET, VCT, peso ideal).
// Los valores de cada unión coinciden con los enums de Prisma del mismo nombre
// (BiologicalSex, ActivityLevel, NutritionGoal, BodyFrame). Core no depende de
// Prisma: la alineación la controla el typecheck de apps/web.

// ── Sexo ──
export const SEX_VALUES = ["FEMALE", "MALE"] as const;
export type Sex = (typeof SEX_VALUES)[number];
export const SEX_OPTIONS: ReadonlyArray<{ value: Sex; label: string }> = [
  { value: "FEMALE", label: "Femenino" },
  { value: "MALE", label: "Masculino" },
];

// ── Actividad física ── (docs/FORMULAS CALORICAS.docx, sección 2)
export const ACTIVITY_LEVEL_VALUES = [
  "SEDENTARY",
  "LIGHT",
  "MODERATE",
  "INTENSE",
  "VERY_INTENSE",
] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVEL_VALUES)[number];
export interface ActivityLevelOption {
  value: ActivityLevel;
  label: string;
  factor: number;
  description: string;
}
export const ACTIVITY_LEVELS: ReadonlyArray<ActivityLevelOption> = [
  {
    value: "SEDENTARY",
    label: "Sedentario",
    factor: 1.2,
    description: "Poco o ningún ejercicio, trabajo de oficina",
  },
  { value: "LIGHT", label: "Ligero", factor: 1.375, description: "Ejercicio ligero 1-3 días/semana" },
  {
    value: "MODERATE",
    label: "Moderado",
    factor: 1.55,
    description: "Ejercicio moderado 3-5 días/semana",
  },
  { value: "INTENSE", label: "Intenso", factor: 1.725, description: "Ejercicio intenso 6-7 días/semana" },
  {
    value: "VERY_INTENSE",
    label: "Muy intenso",
    factor: 1.9,
    description: "Ejercicio muy intenso + trabajo físico/entrenamiento doble",
  },
];

// ── Objetivo nutricional ── (sección 3 del documento de fórmulas; los rangos los usa la Épica 18)
export const NUTRITION_GOAL_VALUES = ["LOSE_WEIGHT", "MAINTAIN", "GAIN_WEIGHT", "GAIN_MUSCLE"] as const;
export type NutritionGoal = (typeof NUTRITION_GOAL_VALUES)[number];
/** Tipos de ajuste por objetivo. Coinciden con el enum AdjustmentRange de Prisma (HU-004). */
export const ADJUSTMENT_RANGE_VALUES = ["MODERATE_DEFICIT", "AGGRESSIVE_DEFICIT", "MAINTENANCE", "SURPLUS"] as const;
export type AdjustmentRangeKey = (typeof ADJUSTMENT_RANGE_VALUES)[number];
export interface GoalAdjustmentRange {
  key: AdjustmentRangeKey;
  label: string;
  /** Sin la aclaración entre paréntesis: "Déficit moderado" | "Déficit agresivo" | "Mantenimiento" | "Superávit". */
  shortLabel: string;
  minPercent: number;
  maxPercent: number;
}
export interface NutritionGoalOption {
  value: NutritionGoal;
  label: string;
  adjustmentRanges: ReadonlyArray<GoalAdjustmentRange>;
}
export const NUTRITION_GOALS: ReadonlyArray<NutritionGoalOption> = [
  {
    value: "LOSE_WEIGHT",
    label: "Bajar de peso",
    adjustmentRanges: [
      { key: "MODERATE_DEFICIT", label: "Déficit moderado", shortLabel: "Déficit moderado", minPercent: -25, maxPercent: -15 },
      {
        key: "AGGRESSIVE_DEFICIT",
        label: "Déficit agresivo (con supervisión)",
        shortLabel: "Déficit agresivo",
        minPercent: -30,
        maxPercent: -25,
      },
    ],
  },
  {
    value: "MAINTAIN",
    label: "Mantener",
    adjustmentRanges: [{ key: "MAINTENANCE", label: "Mantenimiento", shortLabel: "Mantenimiento", minPercent: 0, maxPercent: 0 }],
  },
  {
    value: "GAIN_WEIGHT",
    label: "Subir de peso",
    adjustmentRanges: [{ key: "SURPLUS", label: "Superávit", shortLabel: "Superávit", minPercent: 10, maxPercent: 20 }],
  },
  {
    value: "GAIN_MUSCLE",
    label: "Ganar masa muscular",
    adjustmentRanges: [{ key: "SURPLUS", label: "Superávit", shortLabel: "Superávit", minPercent: 10, maxPercent: 20 }],
  },
];

// ── Contextura ──
export const BODY_FRAME_VALUES = ["SMALL", "MEDIUM", "LARGE"] as const;
export type BodyFrame = (typeof BODY_FRAME_VALUES)[number];
export interface BodyFrameOption {
  value: BodyFrame;
  label: string;
  hamwiAdjustmentPercent: number;
}
export const BODY_FRAMES: ReadonlyArray<BodyFrameOption> = [
  { value: "SMALL", label: "Pequeña", hamwiAdjustmentPercent: -10 },
  { value: "MEDIUM", label: "Mediana", hamwiAdjustmentPercent: 0 },
  { value: "LARGE", label: "Grande", hamwiAdjustmentPercent: 10 },
];
export const DEFAULT_BODY_FRAME: BodyFrame = "MEDIUM";

/** Rango del objetivo con esa key, o null si no le corresponde (p. ej. SURPLUS en LOSE_WEIGHT). */
export function goalAdjustmentRange(goal: NutritionGoal, key: AdjustmentRangeKey): GoalAdjustmentRange | null {
  const option = NUTRITION_GOALS.find((g) => g.value === goal);
  return option?.adjustmentRanges.find((r) => r.key === key) ?? null;
}

/** Contextura a usar en las fórmulas: si no está cargada, se asume Mediana. */
export function effectiveBodyFrame(frame: BodyFrame | null): BodyFrame {
  return frame ?? DEFAULT_BODY_FRAME;
}

// ── Etiquetas (null si value es null) ──
export function sexLabel(value: Sex | null): string | null {
  if (value === null) return null;
  return SEX_OPTIONS.find((o) => o.value === value)?.label ?? null;
}

export function activityLevelOption(value: ActivityLevel | null): ActivityLevelOption | null {
  if (value === null) return null;
  return ACTIVITY_LEVELS.find((o) => o.value === value) ?? null;
}

export function nutritionGoalLabel(value: NutritionGoal | null): string | null {
  if (value === null) return null;
  return NUTRITION_GOALS.find((o) => o.value === value)?.label ?? null;
}

export function bodyFrameLabel(value: BodyFrame | null): string | null {
  if (value === null) return null;
  return BODY_FRAMES.find((o) => o.value === value)?.label ?? null;
}

// ── Edad ──
export const ADULT_AGE_YEARS = 18;

/**
 * Edad en años cumplidos. `birthDate` viene de una columna @db.Date: Prisma la devuelve como
 * medianoche UTC, así que el día de nacimiento se lee con getUTCFullYear/getUTCMonth/getUTCDate.
 * El "hoy" se toma en `timeZone` (con formatInTimeZone(at, timeZone, "yyyy-MM-dd")).
 */
export function computeAgeYears(birthDate: Date, at: Date, timeZone: string): number {
  const birthYear = birthDate.getUTCFullYear();
  const birthMonth = birthDate.getUTCMonth() + 1;
  const birthDay = birthDate.getUTCDate();
  const [y, m, d] = formatInTimeZone(at, timeZone, "yyyy-MM-dd").split("-").map(Number) as [
    number,
    number,
    number,
  ];
  let age = y - birthYear;
  if (m < birthMonth || (m === birthMonth && d < birthDay)) age -= 1;
  return age;
}

export function isMinor(ageYears: number | null): boolean {
  return ageYears !== null && ageYears < ADULT_AGE_YEARS;
}

export const MINOR_WARNING_TEXT = "Las fórmulas son para adultos.";

// ── HU-008: grupos de edad y edad en meses ──
export const PEDIATRIC_MIN_AGE_YEARS = 5;

/** ADULT: ≥ 18 o sin fecha de nacimiento (HU-004, "se lo trata como adulto").
 *  PEDIATRIC: 5 a 17. UNDER_5: 0 a 4. */
export type AgeGroup = "ADULT" | "PEDIATRIC" | "UNDER_5";

export function ageGroupOf(ageYears: number | null): AgeGroup {
  if (ageYears === null || ageYears >= ADULT_AGE_YEARS) return "ADULT";
  if (ageYears >= PEDIATRIC_MIN_AGE_YEARS) return "PEDIATRIC";
  return "UNDER_5";
}

/**
 * Meses cumplidos. Misma regla que computeAgeYears: el día de nacimiento se lee en UTC (columna
 * @db.Date) y el "hoy" en `timeZone`.
 * meses = 12·(año − añoNac) + (mes − mesNac) − (día < díaNac ? 1 : 0).
 * Siempre vale Math.floor(computeAgeMonths(...) / 12) === computeAgeYears(...).
 * Nacidos un 31: el 28/02 todavía no cumplieron el mes (día 28 < 31).
 */
export function computeAgeMonths(birthDate: Date, at: Date, timeZone: string): number {
  const birthYear = birthDate.getUTCFullYear();
  const birthMonth = birthDate.getUTCMonth() + 1;
  const birthDay = birthDate.getUTCDate();
  const [y, m, d] = formatInTimeZone(at, timeZone, "yyyy-MM-dd").split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return 12 * (y - birthYear) + (m - birthMonth) - (d < birthDay ? 1 : 0);
}

/** 149 → "12 años y 5 meses (149 meses)"; 96 → "8 años (96 meses)"; 61 → "5 años y 1 mes (61 meses)";
 *  12 → "1 año (12 meses)". */
export function ageMonthsLabel(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const total = `(${plural(months, "mes", "meses")})`;
  if (years === 0) return `${plural(rest, "mes", "meses")} ${total}`;
  const yearsText = plural(years, "año", "años");
  if (rest === 0) return `${yearsText} ${total}`;
  return `${yearsText} y ${plural(rest, "mes", "meses")} ${total}`;
}

/** Textos de la HU-008 (D15), exactos. */
export const PEDIATRIC_TEXT = {
  formulaDataInfo:
    "Paciente pediátrico: el diagnóstico usa la referencia OMS 2007 y la TMB, las ecuaciones de Schofield.",
  diagnosisInfo: "Paciente pediátrico: referencia OMS 2007 (5 a 19 años).",
  under5: "Menor de 5 años: el sistema no tiene referencias para esta edad.",
  implausible: "Valor fuera de rango: revisá la medición.",
  noReferenceForMeasurementAge: "Sin referencia OMS para la edad de esta medición",
  bmiForAgeLabel: "IMC para la edad",
  heightForAgeLabel: "Talla para la edad",
  bmiForAgeReference: "Normal: Z \u22122 a +1",
  heightForAgeReference: "Adecuada: Z \u2265 \u22122",
  reportBmiForAgeLabel: "IMC para la edad (OMS 2007)",
  reportHeightForAgeLabel: "Talla para la edad (OMS 2007)",
  activityHint: "Factores de actividad de adultos: usalos como orientación.",
  proteinGPerKgHint: "0,85\u20130,95 g/kg (IDR)",
} as const;

// ── Qué falta ──
export type MissingFormulaDataKey =
  | "sex"
  | "activityLevel"
  | "nutritionGoal"
  | "birthDate"
  | "weight"
  | "height";

export interface MissingFormulaDataItem {
  key: MissingFormulaDataKey;
  label: string;
}

export interface FormulaDataPresence {
  sex: Sex | null;
  activityLevel: ActivityLevel | null;
  nutritionGoal: NutritionGoal | null;
  hasBirthDate: boolean;
  weightKg: number | null;
  heightCm: number | null;
  // bodyFrame y bodyFatPercent a propósito NO están: no son faltantes bloqueantes.
}

/** Devuelve los faltantes en este orden fijo:
 *  sex "sexo", activityLevel "actividad física", nutritionGoal "objetivo",
 *  birthDate "fecha de nacimiento", weight "peso", height "talla". */
export function getMissingFormulaData(input: FormulaDataPresence): MissingFormulaDataItem[] {
  const items: MissingFormulaDataItem[] = [];
  if (input.sex === null) items.push({ key: "sex", label: "sexo" });
  if (input.activityLevel === null) items.push({ key: "activityLevel", label: "actividad física" });
  if (input.nutritionGoal === null) items.push({ key: "nutritionGoal", label: "objetivo" });
  if (!input.hasBirthDate) items.push({ key: "birthDate", label: "fecha de nacimiento" });
  if (input.weightKg === null) items.push({ key: "weight", label: "peso" });
  if (input.heightCm === null) items.push({ key: "height", label: "talla" });
  return items;
}

/** null si la lista está vacía. Si no, el aviso con los faltantes y dónde se cargan los que
 *  no son de la tarjeta "Datos para cálculos". */
export function missingFormulaDataMessage(
  items: ReadonlyArray<MissingFormulaDataItem>,
): string | null {
  if (items.length === 0) return null;
  const has = (key: MissingFormulaDataKey) => items.some((i) => i.key === key);
  const sentences = [`Faltan datos para los cálculos: ${items.map((i) => i.label).join(", ")}.`];
  if (has("birthDate")) sentences.push('La fecha de nacimiento se carga en "Datos".');
  const missingWeight = has("weight");
  const missingHeight = has("height");
  if (missingWeight && missingHeight) sentences.push('El peso y la talla se cargan en "Evolución".');
  else if (missingWeight) sentences.push('El peso se carga en "Evolución".');
  else if (missingHeight) sentences.push('La talla se carga en "Evolución".');
  return sentences.join(" ");
}

// ── Números en formato es-AR ──
/** 66.5 → "66,5"; 162 → "162"; 1.375 → "1,375". */
export function formatDecimalEs(value: number, maxFractionDigits = 3): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: maxFractionDigits }).format(value);
}

const MINUS_SIGN = "\u2212";
const signedIntFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0, useGrouping: true });

function signPrefix(value: number): string {
  if (value < 0) return MINUS_SIGN;
  if (value > 0) return "+";
  return "";
}

/** −20 → "−20 %" (U+2212), 15 → "+15 %", 0 → "0 %". */
export function formatSignedPercentEs(value: number): string {
  return `${signPrefix(value)}${formatDecimalEs(Math.abs(value))} %`;
}

/** −119 → "−119" (U+2212), 50 → "+50", 0 → "0". Enteros (Math.round), con separador de miles
 *  es-AR como el resto de las kcal ("+1.200"). */
export function formatSignedIntEs(value: number): string {
  const rounded = Math.round(value);
  return `${signPrefix(rounded)}${signedIntFormat.format(Math.abs(rounded))}`;
}

// ── HU-006: decimales fijos ──
/** Decimales fijos es-AR: (71, 1) → "71,0"; (2.8, 2) → "2,80"; (-0.04, 2) → "-0,04".
 *  Un valor que redondea a cero se muestra sin signo ("0,00", nunca "-0,00"). */
export function formatFixedEs(value: number, decimals: number): string {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  const normalized = rounded === 0 ? 0 : rounded;
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(normalized);
}

/** Con signo U+2212 / "+": (−9.5, 1) → "−9,5"; (1.2, 1) → "+1,2"; (0, 1) → "0,0". */
export function formatSignedFixedEs(value: number, decimals: number): string {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return `${signPrefix(rounded)}${formatFixedEs(Math.abs(rounded), decimals)}`;
}
