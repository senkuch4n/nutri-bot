import { normalize } from "./wake";

/**
 * HU-013: motivo de consulta al reservar. Única fuente de las reglas (límites, normalización,
 * salteo) que usan el bot, el panel y packages/db.
 */

/** D3: largo máximo del motivo (String.prototype.length, después de normalizar). Bot y panel. */
export const BOOKING_REASON_MAX = 500;
/** D3: mínimo de letras o números (\p{L}\p{N}) para que el bot lo tome como motivo. Solo bot. */
export const BOOKING_REASON_MIN_ALNUM = 3;
/** D7: largo del motivo dentro de la alerta de turno nuevo. */
export const BOOKING_REASON_ALERT_MAX = 200;

/**
 * D1 (+ resolución P2): palabras de salteo. Se comparan contra el mensaje ENTERO normalizado
 * "como comando" (sin acentos, minúsculas, sin signos ni emojis, espacios colapsados).
 * "después" se escribe sin acento porque la comparación es contra la forma normalizada.
 */
export const BOOKING_REASON_SKIP_WORDS: readonly string[] = [
  "saltear",
  "salteo",
  "omitir",
  "no",
  "ninguno",
  "nada",
  "prefiero no",
  "paso",
  // Resolución P2 (2026-10-02)
  "saltar",
  "no gracias",
  "prefiero no decirlo",
  "no quiero",
  "despues",
];

const NON_ALNUM_OR_SPACE = /[^\p{L}\p{N}\s]/gu;
const ALNUM = /[\p{L}\p{N}]/gu;
const ONLY_DASHES = /^[\s\-–—]*[\-–—][\s\-–—]*$/u;

/**
 * Normaliza un motivo para guardarlo: "\r\n" → "\n"; colapsa 3+ saltos de línea seguidos a 2;
 * trim. Si queda "" → null. NO recorta el largo (eso lo decide quien llama).
 */
export function normalizeBookingReason(text: string | null | undefined): string | null {
  if (text == null) return null;
  const out = text
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out === "" ? null : out;
}

function asCommand(text: string): string {
  return normalize(text).replace(NON_ALNUM_OR_SPACE, "").replace(/\s+/g, " ").trim();
}

/**
 * true si el mensaje entero es un salteo: su forma "de comando" está en
 * BOOKING_REASON_SKIP_WORDS, o el mensaje está formado solo por guiones (-, –, —) y espacios.
 */
export function isBookingReasonSkip(text: string): boolean {
  if (ONLY_DASHES.test(text.trim())) return true;
  return BOOKING_REASON_SKIP_WORDS.includes(asCommand(text));
}

export type BookingReasonParse =
  | { kind: "ok"; reason: string }
  | { kind: "skip" }
  | { kind: "tooShort" }
  | { kind: "tooLong"; length: number };

/** Bot (paso BOOK_REASON): salteo → vacío → largo → mínimo de letras/números → ok. */
export function parseBookingReason(text: string): BookingReasonParse {
  if (isBookingReasonSkip(text)) return { kind: "skip" };
  const r = normalizeBookingReason(text);
  if (r === null) return { kind: "tooShort" };
  if (r.length > BOOKING_REASON_MAX) return { kind: "tooLong", length: r.length };
  const alnum = r.match(ALNUM)?.length ?? 0;
  if (alnum < BOOKING_REASON_MIN_ALNUM) return { kind: "tooShort" };
  return { kind: "ok", reason: r };
}

/**
 * Panel (crear y editar). Sin mínimo. Vacío → null. Más de BOOKING_REASON_MAX → error con el largo.
 */
export function validateBookingReasonInput(
  raw: string | null | undefined,
): { ok: true; reason: string | null } | { ok: false; error: string } {
  const r = normalizeBookingReason(raw);
  if (r !== null && r.length > BOOKING_REASON_MAX) {
    return {
      ok: false,
      error: `El motivo puede tener hasta ${BOOKING_REASON_MAX} caracteres (tenés ${r.length}).`,
    };
  }
  return { ok: true, reason: r };
}

/**
 * D7: motivo para la alerta. Hasta BOOKING_REASON_ALERT_MAX caracteres (por code point, para no
 * partir un emoji) va tal cual; si no, se recorta y se agrega "… (completo en el panel)".
 */
export function reasonForAlert(reason: string): string {
  const chars = Array.from(reason);
  if (chars.length <= BOOKING_REASON_ALERT_MAX) return reason;
  return `${chars.slice(0, BOOKING_REASON_ALERT_MAX).join("").trimEnd()}… (completo en el panel)`;
}
