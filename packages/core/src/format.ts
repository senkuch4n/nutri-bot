import { formatInTimeZone } from "date-fns-tz";
import { es as esLocale } from "date-fns/locale";

const DEFAULT_LOCALE = "es-AR";

export function formatPrice(
  amount: number | string,
  currency = "ARS",
  locale = DEFAULT_LOCALE,
): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

/** "lunes 1 de septiembre, 09:00" */
export function formatDateTime(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, "EEEE d 'de' MMMM, HH:mm", { locale: esLocale });
}

/** "lunes 1 de septiembre" */
export function formatDate(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, "EEEE d 'de' MMMM", { locale: esLocale });
}

/** "09:00" */
export function formatTime(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, "HH:mm");
}

export interface ServiceLike {
  name: string;
  description?: string | null;
  price: number | string;
  durationMin: number;
}

export function formatServiceList(services: ServiceLike[], currency = "ARS"): string {
  if (services.length === 0) return "Por el momento no hay servicios cargados.";
  return services
    .map((s, i) => {
      const price = formatPrice(s.price, currency);
      const desc = s.description ? `\n   _${s.description}_` : "";
      return `${i + 1}. *${s.name}* — ${price} (${s.durationMin} min)${desc}`;
    })
    .join("\n");
}
