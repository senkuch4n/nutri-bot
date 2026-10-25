// HU-020 (SDD 5.2): renglones de las secciones de menú (días, línea de macros, combinaciones).
import { normalizePdfText, plainText } from "../recipe-import/text";
import { WEEKDAYS, type Weekday } from "../weekly-menu";

const DAY_BY_PLAIN: Record<string, Weekday> = {
  lunes: "MON",
  martes: "TUE",
  miercoles: "WED",
  jueves: "THU",
  viernes: "FRI",
  sabado: "SAT",
  domingo: "SUN",
};

const DAY_RE = /^\s*(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s*(?::\s*(.*))?$/iu;

/** "LUNES" → MON; "LUNES: Té + pan" → MON con rest. "Lunes a viernes tomar agua" → null (es texto). */
export function parseWeekdayLine(text: string): { day: Weekday; rest: string } | null {
  const m = DAY_RE.exec(normalizePdfText(text));
  if (!m) return null;
  const day = DAY_BY_PLAIN[plainText(m[1]!)];
  if (!day) return null;
  return { day, rest: (m[2] ?? "").trim() };
}

const MACRO_WORDS = new Set([
  "hidratos",
  "hidrato",
  "de",
  "carbono",
  "carbonos",
  "fibra",
  "fibras",
  "proteinas",
  "proteina",
  "y",
  "e",
  "grasas",
  "saludables",
  "vitaminas",
  "minerales",
  "alimentaria",
]);
const MACRO_KEYS = new Set(["hidratos", "hidrato", "proteinas", "proteina", "grasas"]);

function macroWords(text: string): string[] | null {
  const words = plainText(text).split(" ").filter(Boolean);
  if (words.length === 0 || !words.every((w) => MACRO_WORDS.has(w))) return null;
  return words;
}

/** Línea cualitativa de macros ("Hidratos de carbono (fibra), proteínas y grasas saludables"). */
export function isQualitativeMacroLine(text: string): boolean {
  const words = macroWords(text);
  return words !== null && words.some((w) => MACRO_KEYS.has(w));
}

/** Segundo renglón de una línea de macros ya empezada ("fibra)", "y minerales"). */
export function isMacroContinuation(text: string): boolean {
  return macroWords(text) !== null;
}

/** normalizePdfText + "+" con un espacio a cada lado. No toca paréntesis. */
export function normalizeCombo(text: string): string {
  return normalizePdfText(text).replace(/\s*\+\s*/g, " + ").trim();
}

/** Tanda nueva cuando el día leído no es posterior al último de la tanda actual. */
export function splitTandas(days: readonly Weekday[]): Weekday[][] {
  const tandas: Weekday[][] = [];
  let last = -1;
  for (const day of days) {
    const idx = WEEKDAYS.indexOf(day);
    if (tandas.length === 0 || idx <= last) tandas.push([]);
    tandas[tandas.length - 1]!.push(day);
    last = idx;
  }
  return tandas;
}
