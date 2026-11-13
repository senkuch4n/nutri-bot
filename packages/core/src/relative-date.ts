// HU-017c-1 (SDD 4.3). Fechas en lenguaje común ("Hoy, 16:30", "hace 3 semanas"), siempre en la zona
// horaria que se pasa (Professional.timezone), nunca en la del proceso.
import { es as esLocale } from "date-fns/locale";
import { dayKeyInTz, formatInTimeZone } from "./time";

const DAY_MS = 86_400_000;

function dayKeyToUtcMs(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Días calendario entre dos "yyyy-MM-dd" (to − from), sin depender de la zona del proceso. */
export function calendarDaysBetween(fromDayKey: string, toDayKey: string): number {
  return Math.round((dayKeyToUtcMs(toDayKey) - dayKeyToUtcMs(fromDayKey)) / DAY_MS);
}

/** Primera letra en mayúscula ("jueves" → "Jueves"). */
export function capitalizeFirst(text: string): string {
  return text ? text.charAt(0).toLocaleUpperCase("es") + text.slice(1) : text;
}

/** Cuándo es un turno, en lenguaje común (hora "H:mm", sin cero adelante):
 *  mismo día que `now` → "Hoy, 16:30"; día siguiente → "Mañana, 10:00";
 *  mismo año → "Jueves 8 de octubre, 10:00"; otro año → "Lunes 4 de enero de 2027, 9:00".
 *  Un instante pasado del mismo día también es "Hoy, …" (quien llama ya filtra futuros). */
export function formatAppointmentWhen(startsAt: Date, now: Date, tz: string): string {
  const time = formatInTimeZone(startsAt, tz, "H:mm");
  const startKey = dayKeyInTz(startsAt, tz);
  const nowKey = dayKeyInTz(now, tz);
  const days = calendarDaysBetween(nowKey, startKey);
  if (days === 0) return `Hoy, ${time}`;
  if (days === 1) return `Mañana, ${time}`;
  const sameYear = startKey.slice(0, 4) === nowKey.slice(0, 4);
  const pattern = sameYear ? "EEEE d 'de' MMMM" : "EEEE d 'de' MMMM 'de' yyyy";
  const date = formatInTimeZone(startsAt, tz, pattern, { locale: esLocale });
  return `${capitalizeFirst(date)}, ${time}`;
}

function plural(n: number, singular: string, pluralForm: string): string {
  return `hace ${n} ${n === 1 ? singular : pluralForm}`;
}

/** Hace cuánto, por días calendario en `tz` (d = días entre el día de `past` y el de `now`):
 *  d ≤ 0 → "hoy" (incluye fechas futuras); 1 → "ayer"; 2–6 → "hace d días";
 *  7–29 → "hace N semana(s)" con N = floor(d/7); 30–364 → "hace N mes(es)" con
 *  N = min(11, max(1, floor(d/30))); ≥ 365 → "hace N año(s)" con N = floor(d/365).
 *  En minúscula: quien llama compone ("Última consulta hace 3 semanas", "escribió ayer"). */
export function formatTimeAgo(past: Date, now: Date, tz: string): string {
  const d = calendarDaysBetween(dayKeyInTz(past, tz), dayKeyInTz(now, tz));
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} días`;
  if (d < 30) return plural(Math.floor(d / 7), "semana", "semanas");
  if (d < 365) return plural(Math.min(11, Math.max(1, Math.floor(d / 30))), "mes", "meses");
  return plural(Math.floor(d / 365), "año", "años");
}
