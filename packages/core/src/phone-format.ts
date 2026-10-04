// HU-017c-1 (SDD 4.2). Formato de teléfonos internacionales sin librerías: el caso argentino
// (móvil con 9 y fijo) con sus códigos de área, y un agrupado genérico para el resto.

/** Códigos de área argentinos de 3 dígitos (sin el 0). */
export const AR_AREA_CODES_3: ReadonlySet<string> = new Set([
  "220", "221", "223", "230", "236", "237", "249", "260", "261", "263", "264", "266", "280", "291",
  "294", "297", "298", "299", "336", "341", "342", "343", "345", "348", "351", "353", "358", "362",
  "364", "370", "376", "379", "380", "381", "383", "385", "387", "388",
]);

/** Códigos de país de 2 dígitos. */
export const COUNTRY_CODES_2: ReadonlySet<string> = new Set([
  "20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41", "43", "44", "45", "46", "47",
  "48", "49", "51", "52", "53", "54", "55", "56", "57", "58", "60", "61", "62", "63", "64", "65",
  "66", "81", "82", "84", "86", "90", "91", "92", "93", "94", "95", "98",
]);

/** "3515552345" → "351 555-2345". Solo si el número nacional (10 dígitos) es argentino; si no, null. */
function formatArgentineNational(national: string): string | null {
  if (national.length !== 10) return null;
  if (!(national.startsWith("11") || national.startsWith("2") || national.startsWith("3"))) return null;
  const areaLength = national.startsWith("11") ? 2 : AR_AREA_CODES_3.has(national.slice(0, 3)) ? 3 : 4;
  const area = national.slice(0, areaLength);
  const subscriber = national.slice(areaLength);
  return `${area} ${subscriber.slice(0, -4)}-${subscriber.slice(-4)}`;
}

/** Agrupa desde la derecha: un grupo final de 4 y grupos de 3; un primer grupo de 1 se une al siguiente. */
function groupFromRight(digits: string): string[] {
  if (digits.length <= 4) return digits ? [digits] : [];
  const groups = [digits.slice(-4)];
  let rest = digits.slice(0, -4);
  while (rest.length > 0) {
    groups.unshift(rest.slice(-3));
    rest = rest.slice(0, -3);
  }
  if (groups.length > 1 && groups[0]!.length === 1) {
    const first = groups.shift()!;
    groups[0] = first + groups[0];
  }
  return groups;
}

function countryCodeLength(digits: string): number {
  if (digits.startsWith("1") || digits.startsWith("7")) return 1;
  return COUNTRY_CODES_2.has(digits.slice(0, 2)) ? 2 : 3;
}

/** Formatea un número internacional en dígitos (acepta "+", espacios y guiones: se descartan).
 *  - "" → "".
 *  - Menos de 8 dígitos → los dígitos tal cual (no es un número internacional completo).
 *  - Argentina con móvil: "549" + 10 dígitos nacionales → "+54 9 <área> <abonado>".
 *  - Argentina fijo: "54" + 10 dígitos nacionales (sin el 9) → "+54 <área> <abonado>".
 *    En los dos casos, solo si el número nacional empieza con "11", "2" o "3".
 *  - Cualquier otro caso: "+<código> <grupos>". */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return digits;

  if (digits.length === 13 && digits.startsWith("549")) {
    const national = formatArgentineNational(digits.slice(3));
    if (national) return `+54 9 ${national}`;
  }
  if (digits.length === 12 && digits.startsWith("54")) {
    const national = formatArgentineNational(digits.slice(2));
    if (national) return `+54 ${national}`;
  }

  const ccLength = countryCodeLength(digits);
  const cc = digits.slice(0, ccLength);
  return ["+" + cc, ...groupFromRight(digits.slice(ccLength))].join(" ");
}
