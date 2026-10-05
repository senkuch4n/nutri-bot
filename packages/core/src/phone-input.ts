// HU-017b-1 (SDD 4.1). Teléfono escrito a mano en "Nuevo turno" (y en Ajustes, 017b-4): se acepta como
// lo escribe la gente ("351 15 555 2345", "0351 555-2345", "+54 9 …") y se normaliza al número
// internacional en dígitos que usa WhatsApp. Sin "+" se asume Argentina (Q8).
import { AR_AREA_CODES_3 } from "./phone-format";

export type PhoneInputResult =
  | { ok: true; digits: string } // número internacional solo dígitos, listo para phoneToJid
  | { ok: false; error: "empty" | "invalid" };

/** Nacional argentino válido: 10 dígitos que empiezan con "11", "2" o "3". */
function isArgentineNational(national: string): boolean {
  return (
    national.length === 10 &&
    (national.startsWith("11") || national.startsWith("2") || national.startsWith("3"))
  );
}

/** Saca un "0" de larga distancia adelante. */
function stripTrunk(national: string): string {
  return national.startsWith("0") ? national.slice(1) : national;
}

/** Con 12 dígitos, saca el "15" que viene después del código de área (2, 3 o 4 dígitos). */
function strip15(national: string): string {
  if (national.length !== 12) return national;
  const areaLength = national.startsWith("11") ? 2 : AR_AREA_CODES_3.has(national.slice(0, 3)) ? 3 : 4;
  if (national.slice(areaLength, areaLength + 2) !== "15") return national;
  return national.slice(0, areaLength) + national.slice(areaLength + 2);
}

function argentine(national: string): PhoneInputResult {
  const cleaned = strip15(stripTrunk(national));
  return isArgentineNational(cleaned) ? { ok: true, digits: `549${cleaned}` } : { ok: false, error: "invalid" };
}

/** Normaliza un teléfono escrito a mano (D4). Reglas, en orden:
 *  1. Sin dígitos (vacío, espacios, letras) → { ok: false, error: "empty" }.
 *  2. Internacional explícito: empieza con "+" o los dígitos empiezan con "00" (se sacan los "00").
 *     - Si el código es "54": nacional = lo que sigue; si empieza con "9" se saca; se aplica
 *       quitarTroncal y quitar15; si queda un nacional argentino válido → "549" + nacional;
 *       si no → "invalid".
 *     - Otro código de país: se respeta tal cual si tiene entre 8 y 15 dígitos; si no → "invalid".
 *  3. Sin "+" (se asume Argentina):
 *     - 13 dígitos que empiezan con "549" y nacional válido → igual.
 *     - 12 dígitos que empiezan con "54" y nacional válido (fijo sin el 9) → "549" + nacional.
 *     - Si no: quitarTroncal (un "0" adelante) y quitar15; si queda un nacional válido → "549" + nacional.
 *     - Cualquier otra cosa → "invalid" (un número de otro país se escribe con "+": Q8).
 *  Nacional argentino válido: 10 dígitos que empiezan con "11", "2" o "3".
 *  quitar15: si el nacional tiene 12 dígitos y después del código de área (2 dígitos si "11"; 3 si
 *  está en AR_AREA_CODES_3; si no, 4) vienen "15", se sacan esos dos dígitos. */
export function parsePhoneInput(raw: string): PhoneInputResult {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return { ok: false, error: "empty" };

  const explicitPlus = trimmed.startsWith("+");
  const doubleZero = !explicitPlus && digits.startsWith("00");
  if (explicitPlus || doubleZero) {
    if (doubleZero) digits = digits.slice(2);
    if (digits.startsWith("54")) {
      let national = digits.slice(2);
      if (national.startsWith("9")) national = national.slice(1);
      return argentine(national);
    }
    return digits.length >= 8 && digits.length <= 15 ? { ok: true, digits } : { ok: false, error: "invalid" };
  }

  if (digits.length === 13 && digits.startsWith("549") && isArgentineNational(digits.slice(3))) {
    return { ok: true, digits };
  }
  if (digits.length === 12 && digits.startsWith("54") && isArgentineNational(digits.slice(2))) {
    return { ok: true, digits: `549${digits.slice(2)}` };
  }
  return argentine(digits);
}

export const PHONE_INPUT_TEXT = {
  empty: "Escribí el número de WhatsApp",
  invalid: "Revisá el número: tiene que tener código de área",
  foreignHint: "Si es de otro país, empezá con +",
  /** formatted = formatPhone(digits). */
  confirmationPreview: (formatted: string) => `La confirmación le llega al ${formatted}`,
} as const;
