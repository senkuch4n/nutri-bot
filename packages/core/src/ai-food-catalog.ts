import { FOOD_GROUP_SHORT_LABELS, type FoodGroupKey, type FoodSourceKey } from "./food-groups";

export interface AiCatalogFood {
  id: string;
  name: string;
  group: FoodGroupKey;
  kcalPer100: number;
}

/** SARA 2 is required for new AI plans. Caller supplies active foods. */
export function selectAiCatalogFoods<T extends { source: FoodSourceKey }>(foods: readonly T[]): readonly T[] {
  return foods.filter((food) => food.source === "SARA2");
}

export const AI_CATALOG_MAX_CHARS = 60_000;

/** Grupos que casi nunca van en un plan: se sacan si el catálogo no entra (D10), en este orden. */
export const AI_EXCLUDABLE_GROUPS: readonly FoodGroupKey[] = [
  "COMIDAS_RAPIDAS",
  "GOLOSINAS_Y_CHOCOLATES",
  "BEBIDAS_ALCOHOLICAS_Y_ENERGIZANTES",
  "SNACKS_SALADOS",
  "SALES",
  "SUPLEMENTOS",
];

function render(foods: readonly AiCatalogFood[]) {
  const lines = foods.map((f, i) => {
    const name = f.name.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
    return `${i + 1}|${name}|${FOOD_GROUP_SHORT_LABELS[f.group]}|${Math.round(f.kcalPer100)}`;
  });
  return { text: lines.join("\n"), idsByRef: foods.map((f) => f.id) };
}

/**
 * Una línea por alimento: "ref|nombre|grupo corto|kcal enteras" (ref = 1..N; "|" del nombre → "/").
 * Si el texto supera maxChars, saca los grupos excluibles (de a uno, en el orden de
 * AI_EXCLUDABLE_GROUPS) hasta que entre, y lo informa en excludedGroups.
 */
export function buildAiFoodCatalog(
  foods: readonly AiCatalogFood[],
  options?: { maxChars?: number },
): { text: string; idsByRef: string[]; excludedGroups: FoodGroupKey[] } {
  const maxChars = options?.maxChars ?? AI_CATALOG_MAX_CHARS;
  let current = foods;
  let result = render(current);
  const excludedGroups: FoodGroupKey[] = [];
  for (const group of AI_EXCLUDABLE_GROUPS) {
    if (result.text.length <= maxChars) break;
    if (!current.some((f) => f.group === group)) continue;
    current = current.filter((f) => f.group !== group);
    excludedGroups.push(group);
    result = render(current);
  }
  return { ...result, excludedGroups };
}
