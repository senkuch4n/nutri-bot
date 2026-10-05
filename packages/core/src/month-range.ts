// HU-017b-3 (SDD 4.1 de 017b-3, D12). Meses como "yyyy-MM" con límites en la zona horaria de la
// profesional (nunca la del proceso): Pagos navega por mes con `?mes=`.
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const MONTH_KEY = /^(\d{4})-(\d{2})$/;

function parse(key: string): { year: number; month: number } | null {
  const match = MONTH_KEY.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < 1970) return null;
  return { year, month };
}

function format(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** "2026-10" → true; "2026-13", "2026-1", "octubre" → false. */
export function isValidMonthKey(key: string): boolean {
  return parse(key) !== null;
}

/** El mes ("yyyy-MM") de un instante en `tz`. */
export function monthKeyInTz(now: Date, tz: string): string {
  return formatInTimeZone(now, tz, "yyyy-MM");
}

/** [día 1 a las 00:00, día 1 del mes siguiente a las 00:00) en `tz`, como instantes UTC.
 *  Tira si la key no es válida (quien llama la valida antes con `isValidMonthKey`). */
export function monthRangeInTz(monthKey: string, tz: string): { from: Date; to: Date } {
  const parsed = parse(monthKey);
  if (!parsed) throw new Error(`Mes inválido: ${monthKey}`);
  const next = shiftMonthKey(monthKey, 1);
  return {
    from: fromZonedTime(`${monthKey}-01T00:00:00`, tz),
    to: fromZonedTime(`${next}-01T00:00:00`, tz),
  };
}

/** Corre la key `delta` meses (negativo hacia atrás), cruzando años. */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const parsed = parse(monthKey);
  if (!parsed) throw new Error(`Mes inválido: ${monthKey}`);
  const index = parsed.year * 12 + (parsed.month - 1) + delta;
  return format(Math.floor(index / 12), (index % 12) + 1);
}

/** "2026-10" → "octubre". */
export function monthName(monthKey: string): string {
  const parsed = parse(monthKey);
  if (!parsed) throw new Error(`Mes inválido: ${monthKey}`);
  return MONTH_NAMES[parsed.month - 1]!;
}

/** "2026-10" → "Octubre 2026". */
export function monthTitle(monthKey: string): string {
  const name = monthName(monthKey);
  return `${name.charAt(0).toLocaleUpperCase("es")}${name.slice(1)} ${monthKey.slice(0, 4)}`;
}
