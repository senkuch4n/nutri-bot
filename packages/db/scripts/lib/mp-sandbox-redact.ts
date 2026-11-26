/**
 * HU-029 · 029a (SDD §A.3): todo lo que imprime o guarda el script de sandbox de suscripciones de
 * Mercado Pago pasa por acá. Saca datos personales, de tarjeta y tokens, y acorta los ids de MP a 6
 * caracteres para que la evidencia del informe no tenga ids completos.
 */

export const REDACTED = "[redacted]";

/** Claves que siempre se tapan, además de las que contienen email/token/card. */
const REDACTED_KEYS = new Set([
  "payer_email",
  "email",
  "first_name",
  "last_name",
  "identification",
  "phone",
  "card_token_id",
  "access_token",
  "token",
  "nickname",
  "address",
]);

/** Claves con url cuyo query lleva el id completo de la preapproval. */
const URL_KEYS = new Set(["init_point", "sandbox_init_point"]);

function isRedactedKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    REDACTED_KEYS.has(k)
    || k.includes("email")
    || k.includes("token")
    || k.includes("card")
    || k.endsWith("first_name")
    || k.endsWith("last_name")
  );
}

function isIdKey(key: string): boolean {
  const k = key.toLowerCase();
  return k === "id" || k.endsWith("_id") || k.endsWith(".id");
}

/** Un id de MP: número largo o string alfanumérico largo con algún dígito (no "ARS", "account_money"). */
function looksLikeMercadoPagoId(value: unknown): value is string | number {
  if (typeof value === "number") return Number.isInteger(value) && String(Math.abs(value)).length >= 7;
  if (typeof value === "string") return /^(?=.*\d)[0-9a-zA-Z-]{7,}$/.test(value);
  return false;
}

/** true si `key: value` es un id de MP (lo que se acorta al imprimir y se recuerda completo en local). */
export function isMercadoPagoIdEntry(key: string, value: unknown): value is string | number {
  return isIdKey(key) && looksLikeMercadoPagoId(value);
}

/** Primeros 6 caracteres + "…" si el valor es más largo. */
export function shortMercadoPagoId(value: string | number): string {
  const s = String(value);
  return s.length > 6 ? `${s.slice(0, 6)}…` : s;
}

function redactUrl(value: string): string {
  const q = value.indexOf("?");
  return q === -1 ? value : `${value.slice(0, q)}?${REDACTED}`;
}

const EMAIL_IN_TEXT = /[^\s@"'<>(),;:]+@[^\s@"'<>(),;:]+\.[^\s@"'<>(),;:]+/g;

/** Copia redactada de una respuesta de MP (u otro valor). Nunca muta el original. */
export function redactMercadoPagoResource(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactMercadoPagoResource(item));
  // Los mensajes de error de MP pueden repetir el email del comprador dentro de un texto.
  if (typeof value === "string") return value.replace(EMAIL_IN_TEXT, REDACTED);
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isRedactedKey(key)) {
      out[key] = child === null || child === undefined ? child : REDACTED;
    } else if (isIdKey(key) && looksLikeMercadoPagoId(child)) {
      out[key] = shortMercadoPagoId(child);
    } else if (URL_KEYS.has(key.toLowerCase()) && typeof child === "string") {
      out[key] = redactUrl(child);
    } else {
      out[key] = redactMercadoPagoResource(child);
    }
  }
  return out;
}
