import { formatInTimeZone, hhmmToMinutes } from "./time";

/** Franja "fuera de horario" de la opción 0. `start`/`end` en "HH:mm", hora de pared en la tz de la profesional. */
export type AfterHoursConfig = { enabled: boolean; start: string; end: string };

export const DEFAULT_AFTER_HOURS: AfterHoursConfig = { enabled: true, start: "22:00", end: "09:00" };

/** Textos de validación (los usa la server action de /ajustes). */
export const AFTER_HOURS_TEXT = {
  invalidTime: "Usá el formato HH:mm (por ejemplo 09:00).",
  sameTimes: "Elegí dos horarios distintos.",
} as const;

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** true si es exactamente "HH:mm" con HH 00–23 y mm 00–59. "9:00" es inválido. */
export function isValidHhmm(value: string): boolean {
  return HHMM_RE.test(value);
}

/** null si es válida; si no, uno de los textos de AFTER_HOURS_TEXT. Cruzar medianoche es válido. */
export function validateAfterHoursConfig(input: { start: string; end: string }): string | null {
  if (!isValidHhmm(input.start) || !isValidHhmm(input.end)) return AFTER_HOURS_TEXT.invalidTime;
  if (input.start === input.end) return AFTER_HOURS_TEXT.sameTimes;
  return null;
}

/**
 * Arma la config desde la fila de Professional. Si `start`/`end` son inválidos o iguales
 * (p. ej. una edición manual en la base) devuelve `enabled: false`, o sea el comportamiento de hoy.
 */
export function afterHoursConfigFrom(pro: {
  afterHoursEnabled: boolean;
  afterHoursStart: string;
  afterHoursEnd: string;
}): AfterHoursConfig {
  const config = { start: pro.afterHoursStart, end: pro.afterHoursEnd };
  if (validateAfterHoursConfig(config) !== null) return { ...config, enabled: false };
  return { ...config, enabled: pro.afterHoursEnabled };
}

/**
 * ¿El instante cae dentro de la franja, en la zona `tz`? Compara minutos de pared.
 * - enabled=false, horas inválidas o start===end → false.
 * - start > end (cruza medianoche, caso normal 22:00→09:00): m >= start || m < end.
 * - start < end (p. ej. 13:00→15:00): start <= m < end.
 * Bordes: el inicio está DENTRO (22:00 → true), el fin está FUERA (09:00 → false).
 */
export function isWithinAfterHours(instant: Date, config: AfterHoursConfig, tz: string): boolean {
  if (!config.enabled) return false;
  if (validateAfterHoursConfig(config) !== null) return false;
  const m = hhmmToMinutes(formatInTimeZone(instant, tz, "HH:mm"));
  const start = hhmmToMinutes(config.start);
  const end = hhmmToMinutes(config.end);
  if (start > end) return m >= start || m < end;
  return m >= start && m < end;
}

/** "09:00" → "9:00", "22:00" → "22:00", "00:30" → "0:30". Para los textos del bot. */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return `${Number(h)}:${m ?? "00"}`;
}
