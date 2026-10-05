// HU-017b-2 (SDD 4.1 de 017b-2). Disponibilidad en palabras: el horario de cada día ("de 9:00 a 13:00 y
// de 15:00 a 19:00"), la superposición de bloques del mismo día, las excepciones ("Lunes 12 de octubre ·
// No atendés · Feriado") y los textos del panel. Todo a partir de "HH:mm" y dayKeys ("yyyy-MM-dd"),
// sin depender de la zona del proceso.
import { es as esLocale } from "date-fns/locale";
import { formatClock } from "./after-hours";
import { hhmmToMinutes, formatInTimeZone } from "./time";

// formatClock ya existía (after-hours, textos del bot) con la misma regla: se reexporta el mismo
// binding para que el contrato de este módulo esté completo sin duplicar la función.
export { formatClock } from "./after-hours";

export interface TimeRange {
  id?: string;
  /** "HH:mm" */
  startTime: string;
  /** "HH:mm" */
  endTime: string;
}

/** Lunes primero (como en la lista de la pantalla). */
export const WEEKDAY_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

/** 0 → "Domingo" … 6 → "Sábado" (como `Date#getDay` y `AvailabilityRule.weekday`). */
export const WEEKDAY_NAMES: Readonly<Record<number, string>> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

/** "de 9:00 a 13:00" */
export function timeRangePhrase(r: TimeRange): string {
  return `de ${formatClock(r.startTime)} a ${formatClock(r.endTime)}`;
}

function byStart(a: TimeRange, b: TimeRange): number {
  return hhmmToMinutes(a.startTime) - hhmmToMinutes(b.startTime) || hhmmToMinutes(a.endTime) - hhmmToMinutes(b.endTime);
}

/** "a", "a y b", "a, b y c". */
function joinEs(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}`;
}

/** Ordenados por inicio: "de 9:00 a 13:00", "de 9:00 a 13:00 y de 15:00 a 19:00",
 *  "de 8:00 a 10:00, de 11:00 a 13:00 y de 15:00 a 19:00"; [] → "No atendés". */
export function dayScheduleText(ranges: readonly TimeRange[]): string {
  if (ranges.length === 0) return "No atendés";
  return joinEs([...ranges].sort(byStart).map(timeRangePhrase));
}

function overlaps(a: TimeRange, b: TimeRange): boolean {
  return (
    hhmmToMinutes(a.startTime) < hhmmToMinutes(b.endTime) && hhmmToMinutes(b.startTime) < hhmmToMinutes(a.endTime)
  );
}

/** Primer rango de `others` (mismo día; sin el de excludeId) que se superpone con candidate:
 *  a.start < b.end && b.start < a.end (que se toquen en el borde no es superposición). null si ninguno.
 *  "Primero" = el que empieza antes. */
export function findOverlap(
  candidate: TimeRange,
  others: readonly TimeRange[],
  excludeId?: string,
): TimeRange | null {
  const sorted = [...others].sort(byStart);
  for (const other of sorted) {
    if (excludeId !== undefined && other.id === excludeId) continue;
    if (overlaps(candidate, other)) return other;
  }
  return null;
}

/** Ids de los rangos que se superponen con algún otro (para marcar "Se superponen"). */
export function overlappingRangeIds(ranges: readonly (TimeRange & { id: string })[]): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      const a = ranges[i]!;
      const b = ranges[j]!;
      if (overlaps(a, b)) {
        ids.add(a.id);
        ids.add(b.id);
      }
    }
  }
  return ids;
}

export type ExceptionKind = "closed_day" | "closed_range" | "custom_hours";

type ExceptionType = "BLOCKED" | "CUSTOM_HOURS";

export function exceptionKindOf(e: {
  type: ExceptionType;
  startTime: string | null;
  endTime: string | null;
}): ExceptionKind {
  if (e.type === "CUSTOM_HOURS") return "custom_hours";
  return e.startTime && e.endTime ? "closed_range" : "closed_day";
}

/** kind → columnas: closed_day → BLOCKED sin horas; closed_range → BLOCKED con horas; custom_hours →
 *  CUSTOM_HOURS con horas. */
export function exceptionFields(
  kind: ExceptionKind,
  startTime: string | null,
  endTime: string | null,
): { type: ExceptionType; startTime: string | null; endTime: string | null } {
  if (kind === "closed_day") return { type: "BLOCKED", startTime: null, endTime: null };
  return { type: kind === "closed_range" ? "BLOCKED" : "CUSTOM_HOURS", startTime, endTime };
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Lunes 12 de octubre"; con " de 2027" si el año no es el de todayKey. */
export function exceptionDayLabel(dayKey: string, todayKey: string): string {
  const pattern = dayKey.slice(0, 4) === todayKey.slice(0, 4) ? "EEEE d 'de' MMMM" : "EEEE d 'de' MMMM 'de' yyyy";
  return capitalizeFirst(formatInTimeZone(new Date(`${dayKey}T12:00:00Z`), "UTC", pattern, { locale: esLocale }));
}

/** "Lunes 12 de octubre · No atendés · Feriado" · "… · No atendés de 14:00 a 16:00" ·
 *  "… · Atendés de 14:00 a 18:00"; sin motivo, sin el último tramo; año si no es el de todayKey. */
export function exceptionLine(
  e: { dayKey: string; type: ExceptionType; startTime: string | null; endTime: string | null; reason: string | null },
  todayKey: string,
): string {
  const kind = exceptionKindOf(e);
  const range = e.startTime && e.endTime ? timeRangePhrase({ startTime: e.startTime, endTime: e.endTime }) : "";
  const what =
    kind === "closed_day" ? "No atendés" : kind === "closed_range" ? `No atendés ${range}` : `Atendés ${range}`;
  const reason = e.reason?.trim();
  return [exceptionDayLabel(e.dayKey, todayKey), what, ...(reason ? [reason] : [])].join(" · ");
}

/** upcoming: dayKey >= todayKey, ascendente; past: dayKey < todayKey, descendente. */
export function splitExceptions<T extends { dayKey: string }>(
  list: readonly T[],
  todayKey: string,
): { upcoming: T[]; past: T[] } {
  const upcoming = list.filter((e) => e.dayKey >= todayKey).sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  const past = list.filter((e) => e.dayKey < todayKey).sort((a, b) => b.dayKey.localeCompare(a.dayKey));
  return { upcoming, past };
}

const EXCEPTION_KIND_TEXT: Record<ExceptionKind, string> = {
  closed_day: "No atiendo todo el día",
  closed_range: "No atiendo un rato",
  custom_hours: "Atiendo en otro horario",
};

/** Textos exactos de la pantalla de Disponibilidad (solo panel; el bot no los usa). */
export const AVAILABILITY_TEXT = {
  weeklyTitle: "Horario de todas las semanas",
  exceptionsTitle: "Días especiales",
  addRange: "Agregar horario",
  addException: "Agregar excepción",
  from: "Desde",
  to: "Hasta",
  save: "Guardar",
  deleteRange: "Borrar este horario",
  overlapsBadge: "Se superponen",
  overlap: (r: TimeRange) => `Se superpone con el horario ${timeRangePhrase(r)}. Cambiá las horas o editá ese horario.`,
  startBeforeEnd: "La hora de inicio tiene que ser antes que la de fin",
  /** day = "Martes" → "Listo, el martes atendés de 9:00 a 13:00". */
  saved: (day: string, r: TimeRange) => `Listo, el ${day.toLowerCase()} atendés ${timeRangePhrase(r)}`,
  /** day = "Lunes" → "¿Borrar el horario del lunes de 15:00 a 19:00?". */
  deleteTitle: (day: string, r: TimeRange) => `¿Borrar el horario del ${day.toLowerCase()} ${timeRangePhrase(r)}?`,
  deleteDescription: "El bot deja de ofrecer turnos en ese horario. Los turnos ya dados no se cancelan.",
  deleteConfirm: "Borrar horario",
  deleted: "Horario borrado",
  deletedUndone: "Listo, el horario volvió",
  exceptionKinds: EXCEPTION_KIND_TEXT,
  reasonLabel: "Motivo (opcional)",
  reasonPlaceholder: "Feriado, congreso…",
  /** dayLabel = "lunes 12 de octubre". */
  exceptionDeleteTitle: (dayLabel: string) => `¿Borrar el día especial del ${dayLabel}?`,
  exceptionDeleteDescription: "El bot vuelve a usar tu horario de todas las semanas ese día.",
  exceptionDeleted: "Excepción borrada",
  exceptionUndone: "Listo, la excepción volvió",
  past: (n: number) => `Pasadas (${n})`,
} as const;
