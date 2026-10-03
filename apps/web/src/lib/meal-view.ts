import {
  atwaterBreakdown,
  computeItemMacros,
  computeRecipeMacros,
  expandRecipeIngredients,
  recipeItemMacros,
  computeWeeklyItemWeights,
  computeWeeklyTotals,
  type Macros,
  type MealMode,
  type FoodGroupKey,
  type MicronutrientPlanItem,
  type RecipeStatusKey,
  type RecipeTypeKey,
  type Weekday,
  type WeeklyMenuMeal,
} from "@nutri-bot/core";
import type { MealItemView, MealView } from "@/components/meals-editor";
import type { RecipeItemView } from "@/components/recipe-picker/types";

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

/** HU-018c: la receta de un ítem, como la trae RECIPE_ITEM_SELECT (los Decimal llegan como unknown). */
interface RawRecipe {
  id: string;
  name: string;
  status: RecipeStatusKey;
  type: RecipeTypeKey | null;
  portionHousehold: string | null;
  yieldPortions: unknown;
  sourceName: string | null;
  photo: { id: string } | null;
  ingredients: readonly {
    label: string | null;
    grams: unknown;
    noQuantity: boolean;
    food: {
      name: string;
      group: string;
      kcalPer100: unknown;
      proteinPer100: unknown;
      carbsPer100: unknown;
      fatPer100: unknown;
      fiberPer100: unknown;
      nutrients?: unknown;
      sodiumMgPer100?: unknown;
    } | null;
  }[];
}

interface RawItem {
  id: string;
  foodId: string | null;
  food: RawFood | null;
  customLabel: string | null;
  quantityGrams: unknown;
  notes: string | null;
  /** HU-018b. Sin el campo → null (todos los días). */
  weekday?: Weekday | null;
  /** HU-018c: ítem de receta. */
  recipeId?: string | null;
  portions?: unknown;
  recipe?: RawRecipe | null;
}

interface RawMeal {
  id: string;
  name: string;
  /** HU-018b. Sin el campo → EVERY_DAY. */
  mode?: MealMode;
  /** HU-018b. Sin el campo → false. */
  isOptions?: boolean;
  items: RawItem[];
}

interface RawMicronutrientMeal {
  id?: string;
  mode?: MealMode;
  isOptions?: boolean;
  items: readonly {
    id?: string;
    weekday?: Weekday | null;
    quantityGrams: unknown;
    food: { nutrients: unknown; sodiumMgPer100: unknown } | null;
    /** HU-018c: con receta, los micronutrientes salen de sus ingredientes. */
    portions?: unknown;
    recipe?: Pick<RawRecipe, "yieldPortions" | "ingredients"> | null;
  }[];
}

const toNumber = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Porciones de un ítem de receta (default 1, como la columna). */
const itemPortions = (portions: unknown): number => toNumber(portions) ?? 1;

/** HU-018c: macros por porción de la receta (computeRecipeMacros de core) y si están incompletos. */
function recipeMacros(recipe: Pick<RawRecipe, "yieldPortions" | "ingredients">) {
  const result = computeRecipeMacros(
    recipe.ingredients.map((i) => ({
      label: i.label,
      grams: toNumber(i.grams),
      noQuantity: i.noQuantity,
      food: i.food
        ? {
            name: i.food.name,
            group: i.food.group as FoodGroupKey,
            kcalPer100: Number(i.food.kcalPer100),
            proteinPer100: Number(i.food.proteinPer100),
            carbsPer100: Number(i.food.carbsPer100),
            fatPer100: Number(i.food.fatPer100),
            fiberPer100: toNumber(i.food.fiberPer100) ?? 0,
          }
        : null,
    })),
    toNumber(recipe.yieldPortions),
  );
  return {
    perPortion: result.perPortion,
    incomplete: result.freeText.names.length > 0 || result.missingGrams.names.length > 0,
  };
}

function hasYield(recipe: Pick<RawRecipe, "yieldPortions">): boolean {
  const y = toNumber(recipe.yieldPortions);
  return y !== null && y > 0;
}

/** Placeholder: los pesos semanales solo miran si el ítem tiene macros, no cuánto valen. */
const HAS_MACROS = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

/**
 * Pesos del promedio diario de la semana (HU-018b), o null si las comidas no traen los campos del
 * menú semanal (entonces cada ítem pesa 1, como antes).
 */
function weeklyWeights(meals: readonly RawMicronutrientMeal[]): Record<string, number> | null {
  const complete = meals.every((meal) => meal.id !== undefined && meal.mode !== undefined &&
    meal.items.every((item) => item.id !== undefined && item.weekday !== undefined));
  if (!complete) return null;
  const weekly: WeeklyMenuMeal[] = meals.map((meal) => ({
    id: meal.id!,
    mode: meal.mode!,
    isOptions: meal.isOptions ?? false,
    items: meal.items.map((item) => ({
      id: item.id!,
      weekday: item.weekday ?? null,
      macros: item.recipe
        ? (hasYield(item.recipe) ? HAS_MACROS : null)
        : item.food && item.quantityGrams != null ? HAS_MACROS : null,
    })),
  }));
  return computeWeeklyItemWeights(weekly);
}

/**
 * Convert Prisma decimal quantities without turning missing values into zero. HU-018b: si las
 * comidas traen `id`, `mode`, `isOptions` y `weekday`, cada ítem lleva su peso en el promedio diario
 * de la semana; si no, `weight` queda sin definir (= 1).
 */
export function toMicronutrientItems(meals: readonly RawMicronutrientMeal[]): MicronutrientPlanItem[] {
  const weights = weeklyWeights(meals);
  const toFood = (food: { nutrients?: unknown; sodiumMgPer100?: unknown } | null) =>
    food ? { nutrients: food.nutrients ?? null, sodiumMgPer100: toNumber(food.sodiumMgPer100) } : null;
  return meals.flatMap((meal) => meal.items.flatMap((item): MicronutrientPlanItem[] => {
    const weight = weights && item.id !== undefined ? { weight: weights[item.id] ?? 1 } : {};
    // HU-018c: un ítem de receta aporta sus ingredientes escalados a las porciones (c.n. no suma).
    if (item.recipe) {
      return expandRecipeIngredients(
        item.recipe.ingredients.map((i) => ({ grams: toNumber(i.grams), noQuantity: i.noQuantity, food: i.food })),
        toNumber(item.recipe.yieldPortions),
        itemPortions(item.portions),
      ).map((i) => ({ quantityGrams: i.grams, food: toFood(i.food), ...weight }));
    }
    return [{
      quantityGrams: item.quantityGrams == null ? null : Number(item.quantityGrams),
      food: toFood(item.food),
      ...weight,
    }];
  }));
}

export function toMealView(meals: RawMeal[]): MealView[] {
  return meals.map((meal) => ({
    id: meal.id,
    name: meal.name,
    mode: meal.mode ?? "EVERY_DAY",
    isOptions: meal.isOptions ?? false,
    items: meal.items.map((item): MealItemView => {
      if (item.recipe) return toRecipeItemView(item, item.recipe);
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
        weekday: item.weekday ?? null,
      };
    }),
  }));
}

/** HU-018c: ítem de receta. Sin popover de Atwater (D13): el desglose está en la ficha de la receta. */
function toRecipeItemView(item: RawItem, recipe: RawRecipe): MealItemView {
  const portions = itemPortions(item.portions);
  const { perPortion, incomplete } = recipeMacros(recipe);
  const view: RecipeItemView = {
    id: recipe.id,
    name: recipe.name,
    status: recipe.status,
    type: recipe.type,
    portions,
    portionHousehold: recipe.portionHousehold,
    photoId: recipe.photo?.id ?? null,
    sourceName: recipe.sourceName,
    macrosIncomplete: incomplete,
  };
  return {
    id: item.id,
    foodId: null,
    foodName: null,
    customLabel: null,
    quantityGrams: null,
    notes: item.notes,
    macros: recipeItemMacros(perPortion, portions),
    kcalBreakdown: null,
    weekday: item.weekday ?? null,
    recipe: view,
  };
}

const NO_MACROS: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

/**
 * HU-018b: totales de la franja fija de un plan o plantilla. Plan no semanal (todos los planes
 * previos a la HU) → el mismo total de siempre ("Total del plan"); semanal → promedio diario de los
 * días cargados.
 */
export function toPlanTotals(meals: readonly MealView[]): { totals: Macros; label: string; weekly: boolean } {
  const weekly = computeWeeklyTotals(meals);
  if (!weekly.isWeekly) return { totals: weekly.days.MON.macros, label: "Total del plan", weekly: false };
  return { totals: weekly.weeklyAverage ?? NO_MACROS, label: "Promedio diario de la semana", weekly: true };
}
