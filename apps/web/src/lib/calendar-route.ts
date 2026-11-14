// HU-017b-1 (SDD 4.3): la URL del calendario acompaña lo que se ve (`?fecha=yyyy-MM-dd&vista=…`).
// Puro (sin React ni DOM), para testearlo. La URL se escribe con `replaceUrlInRouter`
// (lib/patient-tab-route.ts), nunca con `window.history.state`.
import { isValidDayKey, type CalendarView } from "@nutri-bot/core";

export const CALENDAR_VIEWS: readonly CalendarView[] = ["dia", "semana", "mes"];
export type FcViewType = "timeGridDay" | "timeGridWeek" | "dayGridMonth";
export const FC_VIEW: Record<CalendarView, FcViewType> = {
  dia: "timeGridDay",
  semana: "timeGridWeek",
  mes: "dayGridMonth",
};

/** Tipo de vista de FullCalendar → vista del calendario; desconocido → "semana". */
export function calendarViewFromFc(type: string): CalendarView {
  if (type === "timeGridDay") return "dia";
  if (type === "dayGridMonth") return "mes";
  return "semana";
}

function isCalendarView(value: string | null): value is CalendarView {
  return (CALENDAR_VIEWS as readonly string[]).includes(value ?? "");
}

/** Por ancho (D3, sin recordar la última elegida): wide (≥ 768 px) → "mes"; si no → "dia". */
export function defaultCalendarView(wide: boolean): CalendarView {
  return wide ? "mes" : "dia";
}

/** ?fecha= y ?vista= → lo que hay que mostrar.
 *  dayKey: fecha si isValidDayKey(fecha); si no, todayKey (sin error).
 *  view: vista si es una de CALENDAR_VIEWS; si no, "dia" si la fecha era válida (D2); si no,
 *  defaultCalendarView(wide). */
export function resolveCalendarRoute(
  params: { fecha: string | null; vista: string | null },
  ctx: { todayKey: string; wide: boolean },
): { view: CalendarView; dayKey: string } {
  const validDate = params.fecha !== null && isValidDayKey(params.fecha);
  const dayKey = validDate ? (params.fecha as string) : ctx.todayKey;
  const view = isCalendarView(params.vista) ? params.vista : validDate ? "dia" : defaultCalendarView(ctx.wide);
  return { view, dayKey };
}

/** Query canónica (Q2):
 *  - dayKey === todayKey y view === defaultCalendarView(wide) → vacía (URL "/");
 *  - dayKey === todayKey → solo vista;
 *  - otro día → fecha y vista, siempre las dos (sin vista, ?fecha= abriría Día).
 *  Propiedad: resolveCalendarRoute(query(state)) devuelve state. */
export function calendarRouteQuery(
  state: { view: CalendarView; dayKey: string },
  ctx: { todayKey: string; wide: boolean },
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.dayKey === ctx.todayKey) {
    if (state.view !== defaultCalendarView(ctx.wide)) params.set("vista", state.view);
    return params;
  }
  params.set("fecha", state.dayKey);
  params.set("vista", state.view);
  return params;
}

/** href con fecha/vista canónicas; conserva los demás parámetros y el hash. */
export function calendarHref(
  href: string,
  state: { view: CalendarView; dayKey: string },
  ctx: { todayKey: string; wide: boolean },
): string {
  const url = new URL(href);
  url.searchParams.delete("fecha");
  url.searchParams.delete("vista");
  calendarRouteQuery(state, ctx).forEach((value, key) => url.searchParams.set(key, value));
  return url.toString();
}

/** Entrada del calendario: cada pastilla aparece un poco después que la anterior, hasta este tope. */
export const REVEAL_STEP_MS = 40;
export const REVEAL_MAX_DELAY_MS = 900;

export function calendarRevealDelayMs(index: number): number {
  return Math.min(index * REVEAL_STEP_MS, REVEAL_MAX_DELAY_MS);
}

/**
 * Sesión de la entrada del calendario. Se cierra recién cuando se montó la primera tanda de pastillas
 * (`schedule` corre después de ese render): FullCalendar llama a eventsSet con la lista vacía al montarse,
 * antes de traer los turnos, así que cerrarla ahí dejaba la entrada sin animar.
 */
export function createCalendarReveal(schedule: (fn: () => void) => void) {
  let active = true;
  let index = 0;
  return {
    /** Retraso de la pastilla que se monta, o null si la entrada ya terminó. */
    next(): number | null {
      if (!active) return null;
      if (index === 0) schedule(() => (active = false));
      return calendarRevealDelayMs(index++);
    },
  };
}
