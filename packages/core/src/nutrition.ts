export interface FoodMacros {
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  fiberPer100: number;
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

const roundToOne = (value: number) => Math.round(value * 10) / 10;

export function computeItemMacros(food: FoodMacros, quantityGrams: number): Macros {
  if (quantityGrams <= 0) return { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  const factor = quantityGrams / 100;
  return {
    kcal: roundToOne(food.kcalPer100 * factor),
    protein: roundToOne(food.proteinPer100 * factor),
    carbs: roundToOne(food.carbsPer100 * factor),
    fat: roundToOne(food.fatPer100 * factor),
    fiber: roundToOne(food.fiberPer100 * factor),
  };
}

export function sumMacros(items: Macros[]): Macros {
  return {
    kcal: roundToOne(items.reduce((sum, item) => sum + item.kcal, 0)),
    protein: roundToOne(items.reduce((sum, item) => sum + item.protein, 0)),
    carbs: roundToOne(items.reduce((sum, item) => sum + item.carbs, 0)),
    fat: roundToOne(items.reduce((sum, item) => sum + item.fat, 0)),
    fiber: roundToOne(items.reduce((sum, item) => sum + item.fiber, 0)),
  };
}

// ─── Formato de macros (es-AR) ─────────────────────────────────────────────────

const NBSP = " ";
const kcalFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0, useGrouping: true });
const gramsFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, useGrouping: true });

/**
 * Cantidad de un macro en es-AR con espacio duro antes de la unidad.
 * kcal sin decimales ("1.846 kcal"); gramos con hasta 1 decimal ("92,5 g", "61 g").
 */
export function formatMacroAmount(value: number, unit: "kcal" | "g"): string {
  return (unit === "kcal" ? kcalFormat : gramsFormat).format(value) + NBSP + unit;
}

/**
 * Línea de totales del plan: "1.846 kcal · P 92,5 g · C 210,3 g · G 61 g".
 * Con `includeFiber`, suma " · Fibra 25,2 g" al final.
 */
export function formatMacrosLine(m: Macros, options?: { includeFiber?: boolean }): string {
  const parts = [
    formatMacroAmount(m.kcal, "kcal"),
    `P ${formatMacroAmount(m.protein, "g")}`,
    `C ${formatMacroAmount(m.carbs, "g")}`,
    `G ${formatMacroAmount(m.fat, "g")}`,
  ];
  if (options?.includeFiber) parts.push(`Fibra ${formatMacroAmount(m.fiber, "g")}`);
  return parts.join(" · ");
}

// ─── Atwater (HU-005) ──────────────────────────────────────────────────────────

/** Factores de Atwater de SARA 2: kcal por gramo. La fibra no suma kcal. */
export const ATWATER = { protein: 4, carbs: 4, fat: 9, alcohol: 7 } as const;

export interface AtwaterMacros {
  protein: number;
  /** CHO disponibles (sin fibra). */
  carbs: number;
  fat: number;
  /** null/undefined = 0. */
  alcohol?: number | null;
}

const roundTo = (value: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round((value + Math.sign(value) * Number.EPSILON) * f) / f;
};

/** 4·P + 4·CHO + 9·G + 7·alcohol, redondeado a 2 decimales (lo que se guarda en kcalPer100). */
export function atwaterKcal(m: AtwaterMacros): number {
  const raw =
    ATWATER.protein * m.protein +
    ATWATER.carbs * m.carbs +
    ATWATER.fat * m.fat +
    ATWATER.alcohol * (m.alcohol ?? 0);
  return roundTo(raw, 2);
}

export type AtwaterPartKey = "protein" | "carbs" | "fat" | "alcohol";

export interface AtwaterPart {
  key: AtwaterPartKey;
  /** "Proteínas" | "Carbohidratos" | "Grasas" | "Alcohol" */
  label: string;
  /** "P" | "CHO" | "G" | "Alc" */
  short: string;
  /** Gramos de la porción, sin redondear. */
  grams: number;
  factor: 4 | 7 | 9;
  /** Redondeado a 1 decimal. */
  kcal: number;
}

export interface AtwaterBreakdown {
  /** Tamaño de la porción (100 = cada 100 g). */
  grams: number;
  /** P, CHO, G siempre; Alcohol solo si > 0. */
  parts: AtwaterPart[];
  /** atwater(per100) × grams / 100, redondeado a 1 decimal (no la suma de redondeos). */
  totalKcal: number;
}

const PART_META: Record<AtwaterPartKey, { label: string; short: string; factor: 4 | 7 | 9 }> = {
  protein: { label: "Proteínas", short: "P", factor: 4 },
  carbs: { label: "Carbohidratos", short: "CHO", factor: 4 },
  fat: { label: "Grasas", short: "G", factor: 9 },
  alcohol: { label: "Alcohol", short: "Alc", factor: 7 },
};

/** Desglose de una porción a partir de los valores cada 100 g. grams por defecto 100; ≤ 0 → todo 0. */
export function atwaterBreakdown(per100: AtwaterMacros, grams = 100): AtwaterBreakdown {
  const g = Number.isFinite(grams) && grams > 0 ? grams : 0;
  const factor = g / 100;
  const alcohol = per100.alcohol ?? 0;
  const keys: AtwaterPartKey[] = ["protein", "carbs", "fat"];
  if (alcohol > 0) keys.push("alcohol");
  const per100Grams: Record<AtwaterPartKey, number> = {
    protein: per100.protein,
    carbs: per100.carbs,
    fat: per100.fat,
    alcohol,
  };
  const parts = keys.map((key): AtwaterPart => {
    const meta = PART_META[key];
    const partGrams = per100Grams[key] * factor;
    return {
      key,
      label: meta.label,
      short: meta.short,
      grams: partGrams,
      factor: meta.factor,
      kcal: roundTo(partGrams * meta.factor, 1),
    };
  });
  return { grams: g, parts, totalKcal: roundTo(atwaterKcal(per100) * factor, 1) };
}

const oneDecimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, useGrouping: true });
const twoDecimals = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, useGrouping: true });

/** "Proteínas 2,4 g × 4 = 9,6 kcal" (gramos con hasta 2 decimales, kcal con hasta 1). */
export function formatAtwaterPart(part: AtwaterPart): string {
  return `${part.label} ${twoDecimals.format(roundTo(part.grams, 2))} g × ${part.factor} = ${oneDecimal.format(part.kcal)} kcal`;
}

/** "P 14,4 kcal · CHO 171,6 kcal · G 2,7 kcal" (+ " · Alc 27,3 kcal" si hay alcohol). */
export function formatAtwaterCompact(b: AtwaterBreakdown): string {
  return b.parts.map((p) => `${p.short} ${oneDecimal.format(p.kcal)} kcal`).join(" · ");
}

/** "125,8 kcal" (hasta 1 decimal, miles con punto). */
export function formatKcalOneDecimal(value: number): string {
  return `${oneDecimal.format(roundTo(value, 1))} kcal`;
}

/** true si las kcal guardadas no coinciden con Atwater al décimo (aviso de D1). */
export function kcalDiffersFromAtwater(kcalPer100: number, m: AtwaterMacros): boolean {
  return roundTo(kcalPer100, 1) !== roundTo(atwaterKcal(m), 1);
}

export type OwnFoodIssue = "MISSING_MACROS" | "MACROS_OVER_100";

export const OWN_FOOD_ISSUE_MESSAGES: Record<OwnFoodIssue, string> = {
  MISSING_MACROS: "Completá proteínas, carbohidratos y grasas.",
  MACROS_OVER_100: "Los nutrientes suman más de 100 g cada 100 g de alimento.",
};

/** P + CHO + G + fibra + alcohol > 100 → MACROS_OVER_100. Falta P, CHO o G → MISSING_MACROS. */
export function validateOwnFoodMacros(m: {
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber?: number | null;
  alcohol?: number | null;
}): OwnFoodIssue[] {
  const missing = [m.protein, m.carbs, m.fat].some((v) => v === null || !Number.isFinite(v));
  if (missing) return ["MISSING_MACROS"];
  const sum = (m.protein ?? 0) + (m.carbs ?? 0) + (m.fat ?? 0) + (m.fiber ?? 0) + (m.alcohol ?? 0);
  return roundTo(sum, 4) > 100 ? ["MACROS_OVER_100"] : [];
}
