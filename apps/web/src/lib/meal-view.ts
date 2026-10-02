import { atwaterBreakdown, computeItemMacros, type MicronutrientPlanItem } from "@nutri-bot/core";
import type { MealItemView, MealView } from "@/components/meals-editor";

interface RawFood {
  id: string;
  name: string;
  kcalPer100: unknown;
  proteinPer100: unknown;
  carbsPer100: unknown;
  fatPer100: unknown;
  fiberPer100: unknown;
  alcoholPer100: unknown;
}

interface RawItem {
  id: string;
  foodId: string | null;
  food: RawFood | null;
  customLabel: string | null;
  quantityGrams: unknown;
  notes: string | null;
}

interface RawMeal {
  id: string;
  name: string;
  items: RawItem[];
}

/** Convert Prisma decimal quantities without turning missing values into zero. */
export function toMicronutrientItems(meals: readonly {
  items: readonly {
    quantityGrams: unknown;
    food: { nutrients: unknown; sodiumMgPer100: unknown } | null;
  }[];
}[]): MicronutrientPlanItem[] {
  return meals.flatMap((meal) => meal.items.map((item) => ({
    quantityGrams: item.quantityGrams == null ? null : Number(item.quantityGrams),
    food: item.food ? {
      nutrients: item.food.nutrients,
      sodiumMgPer100: item.food.sodiumMgPer100 == null ? null : Number(item.food.sodiumMgPer100),
    } : null,
  })));
}

export function toMealView(meals: RawMeal[]): MealView[] {
  return meals.map((meal) => ({
    id: meal.id,
    name: meal.name,
    items: meal.items.map((item): MealItemView => {
      const quantityGrams = item.quantityGrams !== null ? Number(item.quantityGrams) : null;
      const macros =
        item.food && quantityGrams !== null
          ? computeItemMacros(
              {
                kcalPer100: Number(item.food.kcalPer100),
                proteinPer100: Number(item.food.proteinPer100),
                carbsPer100: Number(item.food.carbsPer100),
                fatPer100: Number(item.food.fatPer100),
                fiberPer100: Number(item.food.fiberPer100 ?? 0),
              },
              quantityGrams,
            )
          : null;
      // Desglose de Atwater de la porción (popover de kcal, D11). El portal y el PDF lo ignoran.
      const kcalBreakdown =
        item.food && quantityGrams !== null
          ? atwaterBreakdown(
              {
                protein: Number(item.food.proteinPer100),
                carbs: Number(item.food.carbsPer100),
                fat: Number(item.food.fatPer100),
                alcohol: item.food.alcoholPer100 === null ? null : Number(item.food.alcoholPer100),
              },
              quantityGrams,
            )
          : null;
      return {
        id: item.id,
        foodId: item.foodId,
        foodName: item.food?.name ?? null,
        customLabel: item.customLabel,
        quantityGrams: quantityGrams !== null ? String(quantityGrams) : null,
        notes: item.notes,
        macros,
        kcalBreakdown,
      };
    }),
  }));
}
