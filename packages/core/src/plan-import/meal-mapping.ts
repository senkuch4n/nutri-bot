// HU-020 (SDD T3, D6/D7 provisoria): qué comidas genera cada sección de menú del PDF y cómo se
// llaman. Cuando la nutricionista confirme qué son las "tandas" de días, se cambia SOLO este archivo
// (y su test): no hace falta migración.
import type { MenuSectionKey } from "../plan-templates";

export type MenuMealKey = "BREAKFAST" | "SNACK" | "LUNCH" | "DINNER";

/** D7: la sección "Desayuno y merienda" nunca crea una comida combinada: va a Desayuno Y a Merienda. */
export const MENU_SECTION_MEALS: Record<MenuSectionKey, readonly { mealKey: MenuMealKey; baseName: string }[]> = {
  BREAKFAST_SNACK: [
    { mealKey: "BREAKFAST", baseName: "Desayuno" },
    { mealKey: "SNACK", baseName: "Merienda" },
  ],
  LUNCH_DINNER: [
    { mealKey: "LUNCH", baseName: "Almuerzo" },
    { mealKey: "DINNER", baseName: "Cena" },
  ],
};

/** D6: con una sola tanda, sin número ("Desayuno"); con 2+, "Desayuno (1)", "Desayuno (2)". */
export function mealNameFor(baseName: string, tanda: number, totalTandas: number): string {
  return totalTandas <= 1 ? baseName : `${baseName} (${tanda})`;
}

export const OPTIONS_MEAL_NAME = "Colaciones";

/** "Almuerzo y Cena:", "Almuerzo :", "Cena:" (con o sin espacios alrededor de ":"). */
export const LUNCH_DINNER_LABELS = {
  re: /^\s*(almuerzo\s+y\s+cena|almuerzo|cena)\s*:\s*/i,
  meals: {
    "almuerzo y cena": ["LUNCH", "DINNER"],
    almuerzo: ["LUNCH"],
    cena: ["DINNER"],
  } as Record<string, readonly ("LUNCH" | "DINNER")[]>,
} as const;

export function matchLunchDinnerLabel(text: string): { meals: readonly ("LUNCH" | "DINNER")[]; rest: string } | null {
  const m = LUNCH_DINNER_LABELS.re.exec(text);
  if (!m) return null;
  const key = m[1]!.toLowerCase().replace(/\s+/g, " ");
  const meals = LUNCH_DINNER_LABELS.meals[key];
  if (!meals) return null;
  return { meals, rest: text.slice(m[0].length).trim() };
}
