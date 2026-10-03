// HU-018a: recetario. Catálogos fijos, macros por porción (calculados siempre desde los
// ingredientes, D4/D10), porciones de ½ (D9, las usa 018c), comparación con la tabla publicada,
// validación para publicar, búsqueda y textos. Lógica pura: sin base, red ni sharp.

import { searchFoods, foodSearchText } from "./food-search";
import type { FoodGroupKey } from "./food-groups";
import type { AtwaterBreakdown, AtwaterPart, FoodMacros, Macros } from "./nutrition";

// ── Catálogos fijos (D12): mismas claves que los enums de Prisma ─────────────────────────────

export const RECIPE_TYPES = [
  "MAIN_DISH",
  "SIDE_DISH",
  "SALAD",
  "SNACK",
  "BREAKFAST",
  "BREAD_DOUGH",
  "DESSERT",
] as const;
export type RecipeTypeKey = (typeof RECIPE_TYPES)[number];
export const RECIPE_TYPE_LABELS: Record<RecipeTypeKey, string> = {
  MAIN_DISH: "Plato principal",
  SIDE_DISH: "Guarnición",
  SALAD: "Ensalada",
  SNACK: "Colación",
  BREAKFAST: "Desayuno y merienda",
  BREAD_DOUGH: "Panes y masas",
  DESSERT: "Dulces y postres",
};

export const RECIPE_MOMENTS = ["BREAKFAST", "LUNCH", "AFTERNOON_SNACK", "DINNER", "SNACK"] as const;
export type RecipeMomentKey = (typeof RECIPE_MOMENTS)[number];
export const RECIPE_MOMENT_LABELS: Record<RecipeMomentKey, string> = {
  BREAKFAST: "Desayuno",
  LUNCH: "Almuerzo",
  AFTERNOON_SNACK: "Merienda",
  DINNER: "Cena",
  SNACK: "Colación",
};

export const RECIPE_TAGS = ["GLUTEN_FREE", "VEGETARIAN", "MEAL_PREP"] as const;
export type RecipeTagKey = (typeof RECIPE_TAGS)[number];
export const RECIPE_TAG_LABELS: Record<RecipeTagKey, string> = {
  GLUTEN_FREE: "Sin TACC",
  VEGETARIAN: "Vegetariana",
  MEAL_PREP: "Apta vianda / freezer",
};

export type RecipeStatusKey = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export const RECIPE_STATUS_LABELS: Record<RecipeStatusKey, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicada",
  ARCHIVED: "Archivada",
};

export function isRecipeTypeKey(value: unknown): value is RecipeTypeKey {
  return typeof value === "string" && (RECIPE_TYPES as readonly string[]).includes(value);
}
export function isRecipeMomentKey(value: unknown): value is RecipeMomentKey {
  return typeof value === "string" && (RECIPE_MOMENTS as readonly string[]).includes(value);
}
export function isRecipeTagKey(value: unknown): value is RecipeTagKey {
  return typeof value === "string" && (RECIPE_TAGS as readonly string[]).includes(value);
}

// ── Textos (SDD 4.4) ─────────────────────────────────────────────────────────────────────────

export const RECIPE_TEXT = {
  warnNoQuantityOne: "1 ingrediente sin cantidad: no suma a los macros",
  warnNoQuantityMany: "{n} ingredientes sin cantidad: no suman a los macros",
  warnNoQuantityCaloric: "{names} sin cantidad: {caloric} {verb} sumar muchas kcal",
  warnFreeText: "Hay ingredientes sin alimento asociado: los macros están incompletos",
  warnMissingGrams: "Falta el gramo de {n} {ingredients}: completalo o marcá «Sin cantidad (c.n.)».",
  warnNoYield: "Cargá cuántas porciones rinde para ver los macros de 1 porción.",
  publishedDiff: "El recetario dice {pub} kcal; con los ingredientes da {calc} kcal",
  usage: "Esta receta está en {parts}. Sus totales van a cambiar.",
  errName: "Poné el nombre de la receta.",
  errNameLong: "El nombre puede tener hasta 120 caracteres.",
  errType: "Elegí el tipo de receta.",
  errMoments: "Elegí al menos un momento del día.",
  errYield: "Cargá cuántas porciones rinde.",
  errYieldRange: "Las porciones tienen que ser más de 0 y hasta 999.",
  errPortion: "Contá cuánto es 1 porción, por ejemplo «¾ albóndigas».",
  errPortionLong: "La porción puede tener hasta 80 caracteres.",
  errIngredients: "Agregá al menos un ingrediente.",
  errIngredientEmpty: "Elegí un alimento o escribí el ingrediente.",
  errIngredientGrams: "Cargá los gramos o marcá «Sin cantidad (c.n.)».",
  errIngredientGramsRange: "Los gramos tienen que ser más de 0 y hasta 99.999.",
  errSource: "Cargá la fuente: el paciente la ve junto a la receta.",
  photoInvalid: "La foto tiene que ser JPG, PNG o WebP y pesar menos de 5 MB.",
  photoSaveError: "No se pudo guardar la foto. Probá de nuevo.",
  saved: "Receta guardada",
  published: "Receta publicada",
  archived: "Receta archivada",
  unarchived: "Receta publicada de nuevo",
  draftDiscarded: "Borrador descartado",
  queueDone: "No quedan borradores para revisar.",
  sessionExpired: "Tu sesión venció. Volvé a entrar.",
} as const;

// ── Helpers de texto ─────────────────────────────────────────────────────────────────────────

const round1 = (value: number) => Math.round((value + Math.sign(value) * Number.EPSILON) * 10) / 10;

function upperFirst(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toLocaleUpperCase("es") + s.slice(1);
}
function lowerFirst(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toLocaleLowerCase("es") + s.slice(1);
}

/** "a" · "a y b" · "a, b y c". */
export function joinListEs(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

const kcalNoDecimals = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0, useGrouping: true });

// ── Macros por porción (D4) ──────────────────────────────────────────────────────────────────

export interface RecipeIngredientForMacros {
  label: string | null;
  grams: number | null;
  noQuantity: boolean;
  food: (FoodMacros & { name: string; group: FoodGroupKey }) | null;
}

export interface RecipeMacroResult {
  /** Suma de los ingredientes con alimento y gramos > 0 (sin redondear por ítem; redondeo final a 1 decimal). */
  total: Macros;
  /** total / yieldPortions, a 1 decimal. null si yieldPortions no es > 0. */
  perPortion: Macros | null;
  /** Desglose de Atwater de 1 porción (P×4, CHO×4, G×9). totalKcal = perPortion.kcal. */
  atwaterPerPortion: AtwaterBreakdown | null;
  /** Suma de los gramos de todos los ingredientes (con o sin alimento) / rendimiento. */
  estimatedPortionGrams: number | null;
  /** Ingredientes c.n.; caloricNames = los de CALORIC_FOOD_GROUPS. */
  noQuantity: { names: string[]; caloricNames: string[] };
  /** Con alimento, sin gramos y sin c.n. Bloquea publicar. */
  missingGrams: { names: string[] };
  /** Sin alimento (texto libre) y sin c.n.: no suman. */
  freeText: { names: string[] };
}

export const CALORIC_FOOD_GROUPS: readonly FoodGroupKey[] = ["ACEITES", "GRASAS", "AZUCARES_MERMELADAS_Y_DULCES"];

/** label si tiene texto; si no, el nombre del alimento hasta la primera coma. */
export function ingredientDisplayName(i: { label: string | null; food: { name: string } | null }): string {
  const label = i.label?.trim() ?? "";
  if (label !== "") return label;
  if (!i.food) return "";
  return i.food.name.split(",")[0]!.trim();
}

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

function isPositive(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export function computeRecipeMacros(
  ingredients: readonly RecipeIngredientForMacros[],
  yieldPortions: number | null,
): RecipeMacroResult {
  const raw = { ...ZERO };
  let gramsSum = 0;
  const noQuantityNames: string[] = [];
  const caloricNames: string[] = [];
  const missing: string[] = [];
  const freeText: string[] = [];

  for (const ing of ingredients) {
    const name = ingredientDisplayName(ing);
    if (!ing.food && name === "") continue; // fila vacía
    if (ing.noQuantity) {
      noQuantityNames.push(name);
      if (ing.food && CALORIC_FOOD_GROUPS.includes(ing.food.group)) caloricNames.push(name);
      continue;
    }
    if (isPositive(ing.grams)) gramsSum += ing.grams;
    if (!ing.food) {
      freeText.push(name);
      continue;
    }
    if (!isPositive(ing.grams)) {
      missing.push(name);
      continue;
    }
    const f = ing.grams / 100;
    raw.kcal += ing.food.kcalPer100 * f;
    raw.protein += ing.food.proteinPer100 * f;
    raw.carbs += ing.food.carbsPer100 * f;
    raw.fat += ing.food.fatPer100 * f;
    raw.fiber += ing.food.fiberPer100 * f;
  }

  const total: Macros = {
    kcal: round1(raw.kcal),
    protein: round1(raw.protein),
    carbs: round1(raw.carbs),
    fat: round1(raw.fat),
    fiber: round1(raw.fiber),
  };

  const y = isPositive(yieldPortions) ? yieldPortions : null;
  let perPortion: Macros | null = null;
  let atwaterPerPortion: AtwaterBreakdown | null = null;
  let estimatedPortionGrams: number | null = null;
  if (y !== null) {
    perPortion = {
      kcal: round1(raw.kcal / y),
      protein: round1(raw.protein / y),
      carbs: round1(raw.carbs / y),
      fat: round1(raw.fat / y),
      fiber: round1(raw.fiber / y),
    };
    estimatedPortionGrams = gramsSum > 0 ? Math.round(gramsSum / y) : null;
    const parts: AtwaterPart[] = [
      { key: "protein", label: "Proteínas", short: "P", grams: raw.protein / y, factor: 4, kcal: round1((raw.protein / y) * 4) },
      { key: "carbs", label: "Carbohidratos", short: "CHO", grams: raw.carbs / y, factor: 4, kcal: round1((raw.carbs / y) * 4) },
      { key: "fat", label: "Grasas", short: "G", grams: raw.fat / y, factor: 9, kcal: round1((raw.fat / y) * 9) },
    ];
    atwaterPerPortion = { grams: estimatedPortionGrams ?? 0, parts, totalKcal: perPortion.kcal };
  }

  return {
    total,
    perPortion,
    atwaterPerPortion,
    estimatedPortionGrams,
    noQuantity: { names: noQuantityNames, caloricNames },
    missingGrams: { names: missing },
    freeText: { names: freeText },
  };
}

/** Avisos de la ficha, en orden: missingGrams, noQuantity, freeText, sin rendimiento. */
export function recipeMacroWarnings(r: RecipeMacroResult, yieldPortions: number | null): string[] {
  const out: string[] = [];
  const missing = r.missingGrams.names.length;
  if (missing > 0) {
    out.push(
      RECIPE_TEXT.warnMissingGrams
        .replace("{n}", String(missing))
        .replace("{ingredients}", missing === 1 ? "ingrediente" : "ingredientes"),
    );
  }
  const nq = r.noQuantity.names;
  if (nq.length > 0) {
    if (r.noQuantity.caloricNames.length > 0) {
      const names = joinListEs(nq.map((n, i) => (i === 0 ? upperFirst(n) : lowerFirst(n))));
      const caloric = joinListEs(r.noQuantity.caloricNames.map(lowerFirst));
      out.push(
        RECIPE_TEXT.warnNoQuantityCaloric
          .replace("{names}", names)
          .replace("{caloric}", caloric)
          .replace("{verb}", r.noQuantity.caloricNames.length === 1 ? "puede" : "pueden"),
      );
    } else if (nq.length === 1) {
      out.push(RECIPE_TEXT.warnNoQuantityOne);
    } else {
      out.push(RECIPE_TEXT.warnNoQuantityMany.replace("{n}", String(nq.length)));
    }
  }
  if (r.freeText.names.length > 0) out.push(RECIPE_TEXT.warnFreeText);
  if (!isPositive(yieldPortions)) out.push(RECIPE_TEXT.warnNoYield);
  return out;
}

// ── Porciones (D9, 018c) ─────────────────────────────────────────────────────────────────────

export const PORTION_STEP = 0.5;
export const PORTION_MIN = 0.5;
export const PORTION_MAX = 4;

/** Valor válido (múltiplo de 0,5 en [0,5; 4]) o null. Tolera el error de coma flotante. */
export function normalizePortions(value: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value / PORTION_STEP) * PORTION_STEP;
  if (Math.abs(value - rounded) > 1e-6) return null;
  if (rounded < PORTION_MIN || rounded > PORTION_MAX) return null;
  return rounded;
}

const clampPortions = (v: number) => Math.min(PORTION_MAX, Math.max(PORTION_MIN, v));

/** +½ / −½ con tope en los extremos. */
export function stepPortions(current: number, direction: 1 | -1): number {
  const base = Number.isFinite(current) ? clampPortions(Math.round(current / PORTION_STEP) * PORTION_STEP) : 1;
  return clampPortions(base + direction * PORTION_STEP);
}

/** "½ porción", "1 porción", "1½ porciones", "2 porciones". */
export function formatPortions(portions: number): string {
  const v = normalizePortions(portions) ?? Math.round(portions * 2) / 2;
  const whole = Math.floor(v);
  const half = v - whole >= 0.5;
  const text = `${whole > 0 ? whole : ""}${half ? "½" : ""}` || "0";
  return `${text} ${v <= 1 ? "porción" : "porciones"}`;
}

export function scaleMacros(m: Macros, factor: number): Macros {
  return {
    kcal: round1(m.kcal * factor),
    protein: round1(m.protein * factor),
    carbs: round1(m.carbs * factor),
    fat: round1(m.fat * factor),
    fiber: round1(m.fiber * factor),
  };
}

/** Macros de un ítem de receta (018c): perPortion × portions. */
export function recipeItemMacros(perPortion: Macros | null, portions: number): Macros | null {
  if (!perPortion) return null;
  return scaleMacros(perPortion, portions);
}

// ── Comparación con la tabla del recetario (D4) ──────────────────────────────────────────────

export const PUBLISHED_MACROS_TOLERANCE = 0.1;

export interface PublishedMacros {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
}

export function compareWithPublished(
  calculated: Macros | null,
  published: PublishedMacros | null,
): { kcalDiffRatio: number | null; exceeds: boolean; message: string | null } {
  const pub = published?.kcal ?? null;
  if (!calculated || pub === null || !Number.isFinite(pub) || pub <= 0) {
    return { kcalDiffRatio: null, exceeds: false, message: null };
  }
  const ratio = Math.abs(calculated.kcal - pub) / pub;
  const exceeds = ratio > PUBLISHED_MACROS_TOLERANCE + 1e-9;
  const message = exceeds
    ? RECIPE_TEXT.publishedDiff
        .replace("{pub}", kcalNoDecimals.format(pub))
        .replace("{calc}", kcalNoDecimals.format(calculated.kcal))
    : null;
  return { kcalDiffRatio: ratio, exceeds, message };
}

// ── Validación para publicar ─────────────────────────────────────────────────────────────────

export interface RecipePublishCheck {
  name: string;
  type: RecipeTypeKey | null;
  moments: readonly RecipeMomentKey[];
  yieldPortions: number | null;
  portionHousehold: string | null;
  origin: "MANUAL" | "IMPORT";
  sourceName: string | null;
  ingredients: readonly { foodId: string | null; label: string | null; grams: number | null; noQuantity: boolean }[];
}

export type RecipeField =
  | "name"
  | "type"
  | "moments"
  | "yieldPortions"
  | "portionHousehold"
  | "ingredients"
  | "sourceName";

export type RecipePublishIssue =
  | { field: RecipeField; message: string }
  | { field: "ingredient"; index: number; message: string };

export const RECIPE_NAME_MAX = 120;
export const RECIPE_PORTION_MAX = 80;
export const RECIPE_YIELD_MAX = 999;
export const RECIPE_GRAMS_MAX = 99999;

export function validateRecipeForPublish(r: RecipePublishCheck): RecipePublishIssue[] {
  const issues: RecipePublishIssue[] = [];
  const name = r.name.trim();
  if (name === "") issues.push({ field: "name", message: RECIPE_TEXT.errName });
  else if (name.length > RECIPE_NAME_MAX) issues.push({ field: "name", message: RECIPE_TEXT.errNameLong });

  if (r.type === null) issues.push({ field: "type", message: RECIPE_TEXT.errType });
  if (r.moments.length === 0) issues.push({ field: "moments", message: RECIPE_TEXT.errMoments });

  if (r.yieldPortions === null || !Number.isFinite(r.yieldPortions)) {
    issues.push({ field: "yieldPortions", message: RECIPE_TEXT.errYield });
  } else if (r.yieldPortions <= 0 || r.yieldPortions > RECIPE_YIELD_MAX) {
    issues.push({ field: "yieldPortions", message: RECIPE_TEXT.errYieldRange });
  }

  const portion = r.portionHousehold?.trim() ?? "";
  if (portion === "") issues.push({ field: "portionHousehold", message: RECIPE_TEXT.errPortion });
  else if (portion.length > RECIPE_PORTION_MAX) {
    issues.push({ field: "portionHousehold", message: RECIPE_TEXT.errPortionLong });
  }

  if (r.ingredients.length === 0) issues.push({ field: "ingredients", message: RECIPE_TEXT.errIngredients });
  r.ingredients.forEach((ing, index) => {
    const label = ing.label?.trim() ?? "";
    const hasGrams = ing.grams !== null && ing.grams !== undefined;
    if (!ing.foodId && label === "") {
      issues.push({ field: "ingredient", index, message: RECIPE_TEXT.errIngredientEmpty });
    } else if (ing.foodId && !ing.noQuantity && !isPositive(ing.grams)) {
      issues.push({ field: "ingredient", index, message: RECIPE_TEXT.errIngredientGrams });
    } else if (hasGrams && !ing.noQuantity && (!Number.isFinite(ing.grams!) || ing.grams! <= 0 || ing.grams! > RECIPE_GRAMS_MAX)) {
      issues.push({ field: "ingredient", index, message: RECIPE_TEXT.errIngredientGramsRange });
    }
  });

  if (r.origin === "IMPORT" && (r.sourceName?.trim() ?? "") === "") {
    issues.push({ field: "sourceName", message: RECIPE_TEXT.errSource });
  }
  return issues;
}

// ── Búsqueda y filtros (lista y 018c) ────────────────────────────────────────────────────────

/** foodSearchText de: nombre + nombres de ingredientes + etiquetas de los tags. */
export function recipeSearchText(input: {
  name: string;
  ingredientNames: readonly string[];
  tags: readonly RecipeTagKey[];
}): string {
  return foodSearchText(
    [input.name, ...input.ingredientNames, ...input.tags.map((t) => RECIPE_TAG_LABELS[t])].join(" "),
  );
}

export interface RecipeFilters {
  query: string;
  type: RecipeTypeKey | null;
  moment: RecipeMomentKey | null;
  tags: readonly RecipeTagKey[];
}

export const EMPTY_RECIPE_FILTERS: RecipeFilters = { query: "", type: null, moment: null, tags: [] };

export function hasActiveRecipeFilters(f: RecipeFilters): boolean {
  return f.query.trim() !== "" || f.type !== null || f.moment !== null || f.tags.length > 0;
}

const collator = new Intl.Collator("es", { sensitivity: "base" });

/** Chips con AND (los tags también); después searchFoods por relevancia. Sin consulta: alfabético. */
export function filterRecipes<
  T extends {
    name: string;
    searchText: string;
    type: RecipeTypeKey | null;
    moments: readonly RecipeMomentKey[];
    tags: readonly RecipeTagKey[];
  },
>(cards: readonly T[], filters: RecipeFilters): T[] {
  const chips = cards.filter(
    (c) =>
      (filters.type === null || c.type === filters.type) &&
      (filters.moment === null || c.moments.includes(filters.moment)) &&
      filters.tags.every((t) => c.tags.includes(t)),
  );
  if (foodSearchText(filters.query) === "") {
    return [...chips].sort((a, b) => collator.compare(a.name, b.name));
  }
  return searchFoods(chips, filters.query);
}

/** "Mostrando 24 de 186 recetas" | "186 recetas" | "1 receta". */
export function recipeCountText(shown: number, total: number, filtered: boolean): string {
  const noun = total === 1 ? "receta" : "recetas";
  if (filtered) return `Mostrando ${shown} de ${total} ${noun}`;
  return `${total} ${noun}`;
}

// ── Uso en planes (D10) ──────────────────────────────────────────────────────────────────────

/** "Esta receta está en 3 planes y 1 plantilla. Sus totales van a cambiar." · null si no se usa. */
export function recipeUsageWarning(u: { plans: number; templates: number }): string | null {
  const parts: string[] = [];
  if (u.plans > 0) parts.push(`${u.plans} ${u.plans === 1 ? "plan" : "planes"}`);
  if (u.templates > 0) parts.push(`${u.templates} ${u.templates === 1 ? "plantilla" : "plantillas"}`);
  if (parts.length === 0) return null;
  return RECIPE_TEXT.usage.replace("{parts}", parts.join(" y "));
}
