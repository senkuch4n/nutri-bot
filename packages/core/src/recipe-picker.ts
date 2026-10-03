// HU-018c: buscador de recetas dentro de una comida. Momento inferido del nombre de la comida (D11),
// alcance (un día, varios días, todos los días o el plan no semanal), impacto en el día contra el
// objetivo (D14, N1) y los textos del buscador, del ítem de receta, del portal y del PDF.
// Lógica pura: sin base, red ni React.

import { foodSearchText } from "./food-search";
import { formatMacroAmount, formatMacrosLine, type Macros } from "./nutrition";
import {
  EMPTY_RECIPE_FILTERS,
  RECIPE_TEXT,
  formatPortions,
  normalizePortions,
  type RecipeFilters,
  type RecipeMomentKey,
} from "./recipes";
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  compareToTarget,
  computeWeeklyTotals,
  isWeeklyMenu,
  joinWeekdaysEs,
  mealTotalForDay,
  type MacroTarget,
  type Weekday,
  type WeeklyMenuItem,
  type WeeklyMenuMeal,
} from "./weekly-menu";

// ── D11: momento desde el nombre de la comida ────────────────────────────────────────────────

const MOMENT_PATTERNS: ReadonlyArray<{ words: string; moment: RecipeMomentKey }> = [
  { words: "desayuno", moment: "BREAKFAST" },
  { words: "almuerzo", moment: "LUNCH" },
  { words: "merienda", moment: "AFTERNOON_SNACK" },
  { words: "cena", moment: "DINNER" },
  { words: "colacion", moment: "SNACK" },
  { words: "colaciones", moment: "SNACK" },
  { words: "media manana", moment: "SNACK" },
  { words: "media tarde", moment: "AFTERNOON_SNACK" },
];

/** Posición de `words` como palabras completas dentro de `text` (ya normalizado), o -1. */
function wholeWordIndex(text: string, words: string): number {
  const padded = ` ${text} `;
  // El espacio agregado adelante compensa el corrimiento: solo importa el orden entre coincidencias.
  return padded.indexOf(` ${words} `);
}

/**
 * Normaliza con foodSearchText (sin tildes ni mayúsculas) y busca palabras completas. Gana la
 * PRIMERA que aparece en el texto. Sin coincidencia → null (el buscador abre sin momento).
 */
export function inferMomentFromMealName(name: string): RecipeMomentKey | null {
  const text = foodSearchText(name);
  if (text === "") return null;
  let best: { at: number; moment: RecipeMomentKey } | null = null;
  for (const p of MOMENT_PATTERNS) {
    const at = wholeWordIndex(text, p.words);
    if (at >= 0 && (best === null || at < best.at)) best = { at, moment: p.moment };
  }
  return best?.moment ?? null;
}

/** Filtros con los que abre el buscador: EMPTY_RECIPE_FILTERS + el momento inferido. */
export function initialPickerFilters(mealName: string): RecipeFilters {
  return { ...EMPTY_RECIPE_FILTERS, moment: inferMomentFromMealName(mealName) };
}

// ── Alcance de lo que se agrega ──────────────────────────────────────────────────────────────

export type PickerScope =
  | { kind: "DAYS"; focusDay: Weekday; days: readonly Weekday[] } // comida PER_DAY; days incluye focusDay
  | { kind: "EVERY_DAY" } // comida EVERY_DAY de un plan semanal
  | { kind: "PLAN" }; // plan no semanal (todas EVERY_DAY)

/** Alcance según el plan, la comida y los días marcados. Lo usan el sheet y los textos. */
export function pickerScope(
  meals: readonly Pick<WeeklyMenuMeal, "mode">[],
  meal: Pick<WeeklyMenuMeal, "mode">,
  focusDay: Weekday | null,
  markedDays: readonly Weekday[],
): PickerScope {
  if (!isWeeklyMenu(meals)) return { kind: "PLAN" };
  if (meal.mode === "EVERY_DAY") return { kind: "EVERY_DAY" };
  const focus = focusDay ?? WEEKDAYS.find((d) => markedDays.includes(d)) ?? "MON";
  const days = WEEKDAYS.filter((d) => d === focus || markedDays.includes(d));
  return { kind: "DAYS", focusDay: focus, days };
}

/**
 * HU-018c-2 (revisión de 018c-1): el alcance que mide el impacto de UNA receta, con los mismos días en
 * los que "Agregar" de verdad la va a agregar (`daysToAdd = daysMissingRecipe(...)`). Así el "Se pasa …
 * el jueves" nunca habla de un día que ya la tiene. Si el día que se edita ya la tiene (la tarjeta está
 * en "Agregada", D5) o no es DAYS, devuelve el alcance tal cual.
 */
export function scopeForDaysToAdd(scope: PickerScope, daysToAdd: readonly Weekday[]): PickerScope {
  if (scope.kind !== "DAYS" || !daysToAdd.includes(scope.focusDay)) return scope;
  const days = WEEKDAYS.filter((d) => daysToAdd.includes(d) && scope.days.includes(d));
  if (days.length === scope.days.length) return scope;
  return { kind: "DAYS", focusDay: scope.focusDay, days };
}

/** Días de `days` en los que la comida NO tiene ya un ítem de esa receta (no se duplica). */
export function daysMissingRecipe(
  meal: { mode: "EVERY_DAY" | "PER_DAY"; items: readonly { weekday: Weekday | null; recipeId?: string | null }[] },
  recipeId: string,
  days: readonly Weekday[],
): Weekday[] {
  if (meal.mode === "EVERY_DAY") {
    return meal.items.some((i) => i.recipeId === recipeId) ? [] : WEEKDAYS.filter((d) => days.includes(d));
  }
  return WEEKDAYS.filter(
    (d) => days.includes(d) && !meal.items.some((i) => i.weekday === d && i.recipeId === recipeId),
  );
}

// ── D14: impacto ─────────────────────────────────────────────────────────────────────────────

export type ImpactMacro = "kcal" | "protein" | "carbs" | "fat";
export type RecipeFit =
  | { kind: "FITS" }
  | { kind: "OVER"; macro: ImpactMacro; excess: number; day: Weekday | null }; // day solo en DAYS con > 1 día

export interface RecipeImpact {
  reference: "DAY" | "WEEK_AVERAGE" | "PLAN_DAY";
  /** Día de referencia (focusDay) en DAYS; null en los otros. */
  day: Weekday | null;
  /** Macros del día de referencia ANTES y DESPUÉS de agregar (vista previa en la franja). */
  before: Macros;
  after: Macros;
  /** round((after.kcal − before.kcal) / target.kcal × 100). Puede ser 0 o negativo (opciones). */
  percentOfTarget: number;
  /** Comida de opciones: el nuevo promedio de la comida (kcal). null si no es de opciones. */
  optionsAverageKcal: number | null;
  fit: RecipeFit;
}

/** Opaco para los consumidores: se arma con prepareRecipeImpact y se reusa en todas las tarjetas. */
export interface RecipeImpactContext {
  readonly meals: readonly WeeklyMenuMeal[];
  readonly meal: WeeklyMenuMeal;
  readonly scope: PickerScope;
  readonly target: MacroTarget;
  readonly before: Macros;
}

const IMPACT_MACROS: readonly ImpactMacro[] = ["kcal", "protein", "carbs", "fat"];

type WeeklyTotals = ReturnType<typeof computeWeeklyTotals>;

function referenceMacros(totals: WeeklyTotals, scope: PickerScope): Macros {
  if (scope.kind === "DAYS") return totals.days[scope.focusDay].macros;
  if (scope.kind === "EVERY_DAY") return totals.weeklyAverage ?? totals.days.MON.macros;
  return totals.days.MON.macros;
}

/** Peor macro OVER de un día (mayor exceso relativo; empate: el primero de IMPACT_MACROS). */
function worstOver(day: Macros, target: MacroTarget): { macro: ImpactMacro; excess: number; relative: number } | null {
  let worst: { macro: ImpactMacro; excess: number; relative: number } | null = null;
  for (const macro of IMPACT_MACROS) {
    const status = compareToTarget(day[macro], target[macro]);
    if (status?.kind !== "OVER") continue;
    const relative = status.excess / target[macro];
    if (!worst || relative > worst.relative) worst = { macro, excess: status.excess, relative };
  }
  return worst;
}

/**
 * null si target es null (plantillas o plan sin prescripción: no hay impacto, D17) o si mealId no
 * está en meals. Se calcula una vez por (meals, mealId, scope, target) y se reusa en todas las tarjetas.
 */
export function prepareRecipeImpact(params: {
  meals: readonly WeeklyMenuMeal[];
  mealId: string;
  scope: PickerScope;
  target: MacroTarget | null;
}): RecipeImpactContext | null {
  if (!params.target) return null;
  const meal = params.meals.find((m) => m.id === params.mealId);
  if (!meal) return null;
  const before = referenceMacros(computeWeeklyTotals(params.meals), params.scope);
  return { meals: params.meals, meal, scope: params.scope, target: params.target, before };
}

/**
 * Agrega a la comida un ítem ficticio { id: "__preview", macros: add } con weekday = cada día de
 * scope.days (DAYS) o null (EVERY_DAY/PLAN), y recalcula con computeWeeklyTotals.
 *   - DAYS: after/before = days[focusDay]. Encaje: el peor día marcado (mayor exceso relativo;
 *     empate: el primero de la semana). Ninguno OVER → FITS.
 *   - EVERY_DAY: after/before = weeklyAverage (si es null, days.MON).
 *   - PLAN: after/before = days.MON.
 */
export function computeRecipeImpact(ctx: RecipeImpactContext, add: Macros): RecipeImpact {
  const { scope, target, meal } = ctx;
  const weekdays: (Weekday | null)[] = scope.kind === "DAYS" ? [...scope.days] : [null];
  const preview: WeeklyMenuItem[] = weekdays.map((weekday) => ({ id: "__preview", weekday, macros: add }));
  const withPreview: WeeklyMenuMeal = { ...meal, items: [...meal.items, ...preview] };
  const meals = ctx.meals.map((m) => (m.id === meal.id ? withPreview : m));
  const totals = computeWeeklyTotals(meals);
  const after = referenceMacros(totals, scope);
  const before = ctx.before;

  let fit: RecipeFit = { kind: "FITS" };
  if (scope.kind === "DAYS") {
    let best: { macro: ImpactMacro; excess: number; relative: number; day: Weekday } | null = null;
    for (const day of WEEKDAYS) {
      if (!scope.days.includes(day)) continue;
      const w = worstOver(totals.days[day].macros, target);
      if (w && (!best || w.relative > best.relative)) best = { ...w, day };
    }
    if (best) {
      fit = { kind: "OVER", macro: best.macro, excess: best.excess, day: scope.days.length > 1 ? best.day : null };
    }
  } else {
    const w = worstOver(after, target);
    if (w) fit = { kind: "OVER", macro: w.macro, excess: w.excess, day: null };
  }

  const refDay: Weekday = scope.kind === "DAYS" ? scope.focusDay : "MON";
  return {
    reference: scope.kind === "DAYS" ? "DAY" : scope.kind === "EVERY_DAY" ? "WEEK_AVERAGE" : "PLAN_DAY",
    day: scope.kind === "DAYS" ? scope.focusDay : null,
    before,
    after,
    percentOfTarget: target.kcal > 0 ? Math.round(((after.kcal - before.kcal) / target.kcal) * 100) : 0,
    optionsAverageKcal: meal.isOptions ? mealTotalForDay(withPreview, refDay).macros.kcal : null,
    fit,
  };
}

const MACRO_NAMES: Record<ImpactMacro, { name: string; unit: "kcal" | "g" }> = {
  kcal: { name: "calorías", unit: "kcal" },
  protein: { name: "proteínas", unit: "g" },
  carbs: { name: "carbohidratos", unit: "g" },
  fat: { name: "grasas", unit: "g" },
};

const NBSP = " ";

/** Textos de la tarjeta y el detalle (4.3). */
export function formatRecipeImpact(impact: RecipeImpact, scope: PickerScope): { percentText: string; fitText: string } {
  let percentText: string;
  if (impact.optionsAverageKcal !== null) {
    percentText = `Como opción, la comida pasa a promediar ${formatMacroAmount(impact.optionsAverageKcal, "kcal")}`;
  } else {
    const ending =
      impact.reference === "DAY" && impact.day
        ? `del ${WEEKDAY_LABELS[impact.day].lower}`
        : impact.reference === "WEEK_AVERAGE"
          ? "de cada día"
          : "del día";
    const amount = impact.percentOfTarget >= 1 ? `${impact.percentOfTarget}${NBSP}%` : `menos de 1${NBSP}%`;
    percentText = `Suma ${amount} de las kcal ${ending}`;
  }

  let fitText: string = RECIPE_PICKER_TEXT.fits;
  if (impact.fit.kind === "OVER") {
    const { name, unit } = MACRO_NAMES[impact.fit.macro];
    const where =
      scope.kind === "EVERY_DAY" ? " en el promedio" : impact.fit.day ? ` el ${WEEKDAY_LABELS[impact.fit.day].lower}` : "";
    fitText = `Se pasa en ${name}${where} (+${formatMacroAmount(Math.round(impact.fit.excess), unit)})`;
  }
  return { percentText, fitText };
}

// ── Textos de porción e ingrediente (editor, portal, PDF, detalle) ───────────────────────────

/**
 * household vacío → formatPortions(p) ("1½ porciones").
 * p = 1 → "1 porción (2 panqueques)". Otro → "1½ porciones (1 porción = 2 panqueques)".
 */
export function recipePortionText(portions: number, household: string | null): string {
  const h = household?.trim() ?? "";
  const base = formatPortions(portions);
  if (h === "") return base;
  if ((normalizePortions(portions) ?? portions) === 1) return `${base} (${h})`;
  return `${base} (1 porción = ${h})`;
}

/** noQuantity → "c.n." · casera + g → "1 taza (300 g)" · solo casera → "1 taza" · solo g → "300 g" · nada → "". */
export function formatIngredientAmount(i: { household: string | null; grams: number | null; noQuantity: boolean }): string {
  if (i.noQuantity) return "c.n.";
  const h = i.household?.trim() ?? "";
  const g = i.grams !== null && Number.isFinite(i.grams) && i.grams > 0 ? formatMacroAmount(i.grams, "g") : "";
  if (h && g) return `${h} (${g})`;
  return h || g;
}

// ── Concordancia (como 018b, pero sobre el nombre de la receta) ──────────────────────────────

const FEMININE_WORDS = new Set(["leche", "leches", "carne", "carnes", "nuez", "nueces", "miel", "mieles", "coliflor", "coliflores", "sal", "sales"]);

/**
 * Género y número aproximados por la PRIMERA palabra (normalizada): plural si termina en "s";
 * femenino si termina en a/as/ión/iones o está en FEMININE_WORDS (leche, carne, nuez, miel, coliflor, sal).
 */
export function genderNumberEs(phrase: string): { feminine: boolean; plural: boolean } {
  const first = foodSearchText(phrase).split(" ")[0] ?? "";
  const plural = first.endsWith("s");
  const feminine = /(a|as|ion|iones)$/.test(first) || FEMININE_WORDS.has(first);
  return { feminine, plural };
}

/** "agregado" → "agregada" / "agregados" / "agregadas" según genderNumberEs(phrase). */
export function agreeParticipleEs(phrase: string, participle: string): string {
  const { feminine, plural } = genderNumberEs(phrase);
  const base = participle.replace(/o$/, feminine ? "a" : "o");
  return plural ? `${base}s` : base;
}

// ── Textos del buscador ──────────────────────────────────────────────────────────────────────

export const PICKER_SUGGESTED_INGREDIENTS: readonly string[] = ["avena", "huevo", "banana", "pollo"];

export const RECIPE_PICKER_TEXT = {
  openButton: "Agregar receta",
  done: "Listo",
  searchPlaceholder: "Buscar por ingrediente o nombre: avena, pollo…",
  searchLabel: "Buscar recetas por ingrediente o nombre",
  daysLabel: "Agregar en:",
  daysHint: "El {day} queda marcado: es el día que estás editando.",
  added: "Agregada",
  remove: "Quitar",
  addError: "No se pudo agregar. Probá de nuevo.",
  notPublished: "Esta receta ya no está publicada.",
  portionsError: "No se pudo cambiar la porción. Probá de nuevo.",
  removeError: "No se pudo quitar. Probá de nuevo.",
  undone: "Listo, se deshizo el cambio",
  fits: "Entra en lo que falta",
  noResultsQuery: "No hay recetas con «{query}».",
  tryAnother: "Probá con otro ingrediente:",
  noResultsFilters: "No hay recetas con estos filtros.",
  clearFilters: "Quitar filtros",
  createRecipe: "Crear receta",
  createRecipeAria: "Crear receta (se abre en otra pestaña)",
  emptyCatalog: "Todavía no hay recetas cargadas.",
  goToRecipes: "Ir a Recetas",
  loadError: "No se pudieron cargar las recetas.",
  retry: "Reintentar",
  itemBadge: "Receta",
  archivedBadge: "Archivada",
  macrosIncomplete: "Macros incompletos",
  stepperMinus: "Restar media porción de {recipe}",
  stepperPlus: "Sumar media porción de {recipe}",
  viewRecipe: "Ver receta",
  // HU-018c-2: detalle de la receta (buscador y portal).
  ingredientsTitle: "Ingredientes",
  preparationTitle: "Preparación",
  tipsTitle: "Tips y conservación",
  previewLoadError: "No se pudo cargar la receta.",
  portalSheetDescription: "Ingredientes y preparación de la receta.",
  previewDescription: "Foto, ingredientes y preparación de la receta, con lo que suma al día.",
  sessionExpired: RECIPE_TEXT.sessionExpired,
  stripWeek: "Promedio diario de la semana",
  stripPlan: "Total del día",
} as const;

/** HU-018c-2: "Rinde 4 porciones" (los ingredientes son para la receta entera). null si no hay rendimiento. */
export function recipeYieldText(yieldPortions: number | null): string | null {
  if (yieldPortions === null || !Number.isFinite(yieldPortions) || yieldPortions <= 0) return null;
  return `Rinde ${formatPortions(yieldPortions)}`;
}

/** HU-018c-2: "Fuente: Nutriarte" / "Foto: Ana" (null si no hay dato). */
export function recipeSourceText(sourceName: string | null): string | null {
  const s = sourceName?.trim() ?? "";
  return s ? `Fuente: ${s}` : null;
}
export function recipePhotoCreditText(credit: string | null): string | null {
  const s = credit?.trim() ?? "";
  return s ? `Foto: ${s}` : null;
}

export function pickerTitle(mealName: string, scope: PickerScope): string {
  if (scope.kind === "DAYS") return `Agregar a ${mealName} · ${WEEKDAY_LABELS[scope.focusDay].long}`;
  if (scope.kind === "EVERY_DAY") return `Agregar a ${mealName} · Todos los días`;
  return `Agregar a ${mealName}`;
}

/** 1 → "Agregar" · n → "Agregar en n días". */
export function addButtonLabel(dayCount: number): string {
  return dayCount > 1 ? `Agregar en ${dayCount} días` : "Agregar";
}

/** "Agregar Panqueques a desayuno del martes" (aria del botón de la tarjeta). */
export function addAriaLabel(recipeName: string, mealName: string, scope: PickerScope): string {
  const meal = mealName.toLocaleLowerCase("es-AR");
  if (scope.kind === "DAYS") return `Agregar ${recipeName} a ${meal} del ${WEEKDAY_LABELS[scope.focusDay].lower}`;
  return `Agregar ${recipeName} a ${meal}`;
}

/** "Agregar receta a Desayuno del martes" (aria del botón de la comida). */
export function openPickerAriaLabel(mealName: string, scope: PickerScope): string {
  if (scope.kind === "DAYS") return `Agregar receta a ${mealName} del ${WEEKDAY_LABELS[scope.focusDay].lower}`;
  if (scope.kind === "EVERY_DAY") return `Agregar receta a ${mealName} (todos los días)`;
  return `Agregar receta a ${mealName}`;
}

/** "El martes queda marcado: es el día que estás editando." */
export function pickerDaysHint(focusDay: Weekday): string {
  return RECIPE_PICKER_TEXT.daysHint.replace("{day}", WEEKDAY_LABELS[focusDay].lower);
}

/** "Martes: 1.240 kcal · P 70 g · C 150 g · G 40 g" (franja sin objetivo). */
export function noTargetStripText(title: string, macros: Macros): string {
  return `${title}: ${formatMacrosLine(macros)}`;
}

/** "Panqueques de avena y banana agregados a Desayuno (martes, jueves y sábado)". */
export function recipeAddedMessage(
  recipeName: string,
  mealName: string,
  scope: PickerScope,
  addedDays: readonly Weekday[],
): string {
  const head = `${recipeName} ${agreeParticipleEs(recipeName, "agregado")} a ${mealName}`;
  if (scope.kind === "DAYS") return `${head} (${joinWeekdaysEs(addedDays)})`;
  if (scope.kind === "EVERY_DAY") return `${head} (todos los días)`;
  return head;
}

/** Reemplaza {recipe} en los aria-label del control de porciones. */
export function stepperAriaLabel(direction: 1 | -1, recipeName: string): string {
  return (direction === 1 ? RECIPE_PICKER_TEXT.stepperPlus : RECIPE_PICKER_TEXT.stepperMinus).replace("{recipe}", recipeName);
}
