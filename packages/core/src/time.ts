import { fromZonedTime, toZonedTime, formatInTimeZone } from "date-fns-tz";
import { addDays, startOfDay } from "date-fns";

/** "yyyy-MM-dd" para un instante, en la zona horaria dada. */
export function dayKeyInTz(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, "yyyy-MM-dd");
}

/** Día de la semana (0=domingo..6=sábado) de un instante, en la zona dada. */
export function weekdayInTz(instant: Date, tz: string): number {
  return toZonedTime(instant, tz).getDay();
}

/**
 * Combina un día calendario ("yyyy-MM-dd") y una hora de pared ("HH:mm")
 * interpretados en `tz`, y devuelve el instante UTC correspondiente.
 */
export function wallTimeToUtc(dayKey: string, hhmm: string, tz: string): Date {
  return fromZonedTime(`${dayKey}T${hhmm}:00`, tz);
}

/** Lista de "yyyy-MM-dd" (en `tz`) desde `from` hasta `to` inclusive. */
export function dayKeysBetween(from: Date, to: Date, tz: string): string[] {
  const keys: string[] = [];
  let cursor = startOfDay(toZonedTime(from, tz));
  const end = startOfDay(toZonedTime(to, tz));
  while (cursor <= end) {
    keys.push(formatInTimeZone(fromZonedTime(cursor, tz), tz, "yyyy-MM-dd"));
    cursor = addDays(cursor, 1);
  }
  return keys;
}

/** "HH:mm" -> minutos desde medianoche. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export { formatInTimeZone, toZonedTime, fromZonedTime };
