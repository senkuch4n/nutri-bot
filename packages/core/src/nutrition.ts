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
