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
