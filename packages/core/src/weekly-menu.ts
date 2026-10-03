/**
 * HU-018b: menú semanal. Lógica pura (sin base ni red) que comparten el panel, el portal, el PDF y
 * los scripts de verificación. Cada comida es "Igual todos los días" (EVERY_DAY, ítems con
 * weekday = null; puede ser de opciones "Elegí una") o "Cambia cada día" (PER_DAY, cada ítem con su
 * día). La semana es fija, de lunes a domingo.
 */
import { sumMacros, type Macros } from "./nutrition";
import { weekdayInTz } from "./time";

export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
/** Mismos valores que el enum `Weekday` de Prisma. */
export type Weekday = (typeof WEEKDAYS)[number];
/** Mismos valores que el enum `MealMode` de Prisma. */
export type MealMode = "EVERY_DAY" | "PER_DAY";

export const WEEKDAY_LABELS: Record<Weekday, { short: string; long: string; lower: string }> = {
  MON: { short: "Lun", long: "Lunes", lower: "lunes" },
  TUE: { short: "Mar", long: "Martes", lower: "martes" },
  WED: { short: "Mié", long: "Miércoles", lower: "miércoles" },
  THU: { short: "Jue", long: "Jueves", lower: "jueves" },
  FRI: { short: "Vie", long: "Viernes", lower: "viernes" },
  SAT: { short: "Sáb", long: "Sábado", lower: "sábado" },
  SUN: { short: "Dom", long: "Domingo", lower: "domingo" },
};

/** Tolerancia de "En objetivo" (D14): ±5 %. */
export const TARGET_TOLERANCE = 0.05;

/** Comidas de un plan nuevo (y de una plantilla nueva), en este orden. */
export const DEFAULT_WEEKLY_MEALS: ReadonlyArray<{ name: string; mode: MealMode; isOptions: boolean }> = [
  { name: "Desayuno", mode: "PER_DAY", isOptions: false },
  { name: "Almuerzo", mode: "PER_DAY", isOptions: false },
  { name: "Merienda", mode: "PER_DAY", isOptions: false },
  { name: "Cena", mode: "PER_DAY", isOptions: false },
  { name: "Colaciones", mode: "EVERY_DAY", isOptions: true },
];

export interface WeeklyMenuItem {
  id: string;
  weekday: Weekday | null;
  macros: Macros | null;
}
export interface WeeklyMenuMeal {
  id: string;
  mode: MealMode;
  isOptions: boolean;
  items: WeeklyMenuItem[];
}

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
const MACRO_KEYS = ["kcal", "protein", "carbs", "fat", "fiber"] as const;
const round1 = (value: number) => Math.round(value * 10) / 10;

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === "string" && (WEEKDAYS as readonly string[]).includes(value);
}

/** true si alguna comida es PER_DAY. Si es false (planes migrados), la UI se ve como antes. */
export function isWeeklyMenu(meals: readonly Pick<WeeklyMenuMeal, "mode">[]): boolean {
  return meals.some((meal) => meal.mode === "PER_DAY");
}

/** Ítems de una comida que valen para `day`: EVERY_DAY → todos; PER_DAY → los de ese día. */
export function itemsForDay<T extends { weekday: Weekday | null }>(
  meal: { mode: MealMode; items: readonly T[] },
  day: Weekday,
): T[] {
  if (meal.mode === "EVERY_DAY") return [...meal.items];
  return meal.items.filter((item) => item.weekday === day);
}

/**
 * Resumen de una comida de opciones: promedio y rango de las opciones con macros (las de texto
 * libre no cuentan). null si ninguna opción tiene macros.
 */
export function summarizeOptions(options: readonly (Macros | null)[]): {
  average: Macros;
  minKcal: number;
  maxKcal: number;
  countedOptions: number;
} | null {
  const counted = options.filter((m): m is Macros => m !== null);
  if (counted.length === 0) return null;
  const average = { ...ZERO };
  for (const key of MACRO_KEYS) {
    average[key] = round1(counted.reduce((sum, m) => sum + m[key], 0) / counted.length);
  }
  const kcals = counted.map((m) => m.kcal);
  return {
    average,
    minKcal: Math.min(...kcals),
    maxKcal: Math.max(...kcals),
    countedOptions: counted.length,
  };
}

/** Lista plana de macros que aporta una comida a un día (un elemento por comida de opciones). */
function mealDayContributions(meal: WeeklyMenuMeal, day: Weekday): Macros[] {
  const items = itemsForDay(meal, day);
  if (meal.isOptions) {
    const summary = summarizeOptions(items.map((item) => item.macros));
    return summary ? [summary.average] : [];
  }
  return items.flatMap((item) => (item.macros ? [item.macros] : []));
}

/**
 * Total de una comida en un día. Sin opciones: sumMacros de sus ítems del día. Con opciones: el
 * promedio (N1 = a) y el rango en `optionsRange`.
 */
export function mealTotalForDay(
  meal: WeeklyMenuMeal,
  day: Weekday,
): { macros: Macros; optionsRange: { minKcal: number; maxKcal: number } | null; itemCount: number } {
  const items = itemsForDay(meal, day);
  if (meal.isOptions) {
    const summary = summarizeOptions(items.map((item) => item.macros));
    return {
      macros: summary ? summary.average : { ...ZERO },
      optionsRange: summary ? { minKcal: summary.minKcal, maxKcal: summary.maxKcal } : null,
      itemCount: items.length,
    };
  }
  return { macros: sumMacros(mealDayContributions(meal, day)), optionsRange: null, itemCount: items.length };
}

function loadedDaysOf(meals: readonly WeeklyMenuMeal[], isWeekly: boolean): Weekday[] {
  if (!isWeekly) {
    return meals.some((meal) => meal.items.length > 0) ? [...WEEKDAYS] : [];
  }
  return WEEKDAYS.filter((day) =>
    meals.some((meal) => meal.mode === "PER_DAY" && meal.items.some((item) => item.weekday === day)),
  );
}

/** Totales por día y promedio semanal (lo usan el editor, el portal, el PDF y los scripts). */
export function computeWeeklyTotals(meals: readonly WeeklyMenuMeal[]): {
  isWeekly: boolean;
  days: Record<Weekday, { macros: Macros; loaded: boolean }>;
  loadedDays: Weekday[];
  /** Promedio de los días cargados. Si ningún día está cargado, null. */
  weeklyAverage: Macros | null;
} {
  const isWeekly = isWeeklyMenu(meals);
  const loadedDays = loadedDaysOf(meals, isWeekly);
  const days = {} as Record<Weekday, { macros: Macros; loaded: boolean }>;
  for (const day of WEEKDAYS) {
    // Lista plana a propósito: en un plan migrado es la misma llamada sumMacros(todos los ítems).
    const flat = meals.flatMap((meal) => mealDayContributions(meal, day));
    days[day] = { macros: sumMacros(flat), loaded: loadedDays.includes(day) };
  }
  let weeklyAverage: Macros | null = null;
  if (loadedDays.length > 0) {
    weeklyAverage = { ...ZERO };
    for (const key of MACRO_KEYS) {
      const total = loadedDays.reduce((sum, day) => sum + days[day].macros[key], 0);
      weeklyAverage[key] = round1(total / loadedDays.length);
    }
  }
  return { isWeekly, days, loadedDays, weeklyAverage };
}

/** Peso de cada ítem en el promedio diario de la semana (micronutrientes). */
export function computeWeeklyItemWeights(meals: readonly WeeklyMenuMeal[]): Record<string, number> {
  const isWeekly = isWeeklyMenu(meals);
  let n = loadedDaysOf(meals, isWeekly).length;
  if (n === 0 && meals.some((meal) => meal.mode === "EVERY_DAY" && meal.items.length > 0)) n = 1;
  const weights: Record<string, number> = {};
  for (const meal of meals) {
    if (meal.mode === "PER_DAY") {
      for (const item of meal.items) weights[item.id] = n > 0 ? 1 / n : 0;
    } else if (meal.isOptions) {
      const k = meal.items.filter((item) => item.macros !== null).length;
      for (const item of meal.items) weights[item.id] = item.macros !== null && k > 0 ? 1 / k : 0;
    } else {
      for (const item of meal.items) weights[item.id] = 1;
    }
  }
  return weights;
}

export type TargetStatus =
  | { kind: "ON_TARGET" }
  | { kind: "UNDER"; missing: number }
  | { kind: "OVER"; excess: number };

/** |value − target| ≤ target × tolerance → ON_TARGET. target ≤ 0 → null (sin estado). */
export function compareToTarget(
  value: number,
  target: number,
  tolerance: number = TARGET_TOLERANCE,
): TargetStatus | null {
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(value)) return null;
  const diff = value - target;
  // El epsilon evita que un borde exacto (1.710 contra 1.800) caiga afuera por el punto flotante.
  if (Math.abs(diff) <= target * tolerance + 1e-9) return { kind: "ON_TARGET" };
  return diff < 0 ? { kind: "UNDER", missing: round1(-diff) } : { kind: "OVER", excess: round1(diff) };
}

const integerFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0, useGrouping: true });

/** "Faltan 560 kcal" · "Falta 1 g" · "En objetivo" · "Se pasa 12 g". Sin decimales, es-AR. */
export function formatTargetStatus(status: TargetStatus, unit: "kcal" | "g"): string {
  if (status.kind === "ON_TARGET") return "En objetivo";
  if (status.kind === "UNDER") {
    const n = Math.round(status.missing);
    return `${n === 1 ? "Falta" : "Faltan"} ${integerFormat.format(n)} ${unit}`;
  }
  return `Se pasa ${integerFormat.format(Math.round(status.excess))} ${unit}`;
}

export interface MacroTarget {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

const STATUS_MACROS = [
  { key: "protein", letter: "P" },
  { key: "carbs", letter: "C" },
  { key: "fat", letter: "G" },
] as const;

/**
 * Estado resumido de un día para la vista Semana: el mayor exceso relativo gana; si no, faltan kcal;
 * si no, el macro con mayor faltante relativo; si no, "En objetivo".
 */
export function summarizeDayStatus(day: Macros, target: MacroTarget): string {
  const kcal = compareToTarget(day.kcal, target.kcal);
  const macros = STATUS_MACROS.map((m) => ({ ...m, status: compareToTarget(day[m.key], target[m.key]), target: target[m.key] }));

  let worstOver: { text: string; relative: number } | null = null;
  if (kcal?.kind === "OVER") worstOver = { text: formatTargetStatus(kcal, "kcal"), relative: kcal.excess / target.kcal };
  for (const m of macros) {
    if (m.status?.kind !== "OVER") continue;
    const relative = m.status.excess / m.target;
    if (!worstOver || relative > worstOver.relative) {
      worstOver = { text: `${formatTargetStatus(m.status, "g")} ${m.letter}`, relative };
    }
  }
  if (worstOver) return worstOver.text;
  if (kcal?.kind === "UNDER") return formatTargetStatus(kcal, "kcal");

  let worstUnder: { text: string; relative: number } | null = null;
  for (const m of macros) {
    if (m.status?.kind !== "UNDER") continue;
    const relative = m.status.missing / m.target;
    if (!worstUnder || relative > worstUnder.relative) {
      worstUnder = { text: `${formatTargetStatus(m.status, "g")} ${m.letter}`, relative };
    }
  }
  return worstUnder ? worstUnder.text : "En objetivo";
}

/** "lunes", "lunes y martes", "lunes, martes y miércoles" (en el orden de la semana). */
export function joinWeekdaysEs(days: readonly Weekday[], form: "lower" | "long" = "lower"): string {
  const labels = WEEKDAYS.filter((day) => days.includes(day)).map((day) => WEEKDAY_LABELS[day][form]);
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
}

const BY_JS_DAY: readonly Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Día de la semana de `instant` en `timeZone` (portal: "hoy" en la zona de la profesional). */
export function weekdayInTimeZone(instant: Date, timeZone: string): Weekday {
  return BY_JS_DAY[weekdayInTz(instant, timeZone)]!;
}
