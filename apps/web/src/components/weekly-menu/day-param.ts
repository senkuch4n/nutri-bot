// HU-018b (SDD 7.2): el día elegido en el editor vive en la URL como `?dia=lun|…|dom|semana`, así una
// recarga o una revalidación lo conservan. Puro: lo usan la página (servidor) y el editor (cliente).
import type { Weekday } from "@nutri-bot/core";
import type { DaySelection } from "./day-selector";

const PARAM_BY_DAY: Record<DaySelection, string> = {
  WEEK: "semana",
  MON: "lun",
  TUE: "mar",
  WED: "mie",
  THU: "jue",
  FRI: "vie",
  SAT: "sab",
  SUN: "dom",
};

const DAY_BY_PARAM = Object.fromEntries(
  Object.entries(PARAM_BY_DAY).map(([day, param]) => [param, day as DaySelection]),
) as Record<string, DaySelection>;

export function toDayParam(day: DaySelection): string {
  return PARAM_BY_DAY[day];
}

/** `?dia=` válido → ese día; cualquier otra cosa → null. */
export function parseDayParam(value: string | string[] | undefined | null): DaySelection | null {
  if (typeof value !== "string") return null;
  return DAY_BY_PARAM[value.toLowerCase()] ?? null;
}

/** Día con el que abre el editor: `?dia=` válido; si no, "Semana" si el plan está vacío; si no, lunes. */
export function initialDayFor(
  param: string | string[] | undefined | null,
  meals: readonly { items: readonly unknown[] }[],
): DaySelection {
  const parsed = parseDayParam(param);
  if (parsed) return parsed;
  return meals.some((meal) => meal.items.length > 0) ? ("MON" satisfies Weekday) : "WEEK";
}
