// HU-018d: medidas caseras de los alimentos ("1 taza = 180 g"). Cantidad en cuartos (D5), plural y
// singular en español (D6), gramos del ítem, kcal por medida, validación, textos y el parser del
// unitHint de texto libre (D9). Lógica pura: sin base, red ni React.

import { foodSearchText } from "./food-search";
import { RECIPE_TEXT } from "./recipes";

// ── Cantidad (D5) ────────────────────────────────────────────────────────────────────────────

export const MEASURE_QTY_STEP = 0.25;
export const MEASURE_QTY_MIN = 0.25;
export const MEASURE_QTY_MAX = 20;

/** Múltiplo de ¼ en [¼, 20] (tolera el error de coma flotante) o null. */
export function normalizeMeasureQty(value: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value / MEASURE_QTY_STEP) * MEASURE_QTY_STEP;
  if (Math.abs(value - rounded) > 1e-6) return null;
  if (rounded < MEASURE_QTY_MIN || rounded > MEASURE_QTY_MAX) return null;
  return rounded;
}

const clampQty = (v: number) => Math.min(MEASURE_QTY_MAX, Math.max(MEASURE_QTY_MIN, v));

/** ±¼ con tope en los extremos. Un valor no finito arranca en 1. */
export function stepMeasureQty(current: number, direction: 1 | -1): number {
  const base = Number.isFinite(current)
    ? clampQty(Math.round(current / MEASURE_QTY_STEP) * MEASURE_QTY_STEP)
    : 1;
  return clampQty(base + direction * MEASURE_QTY_STEP);
}

const QUARTER_CHARS = ["", "¼", "½", "¾"] as const;

/** "¼", "½", "¾", "1", "1¼", "1½", "1¾", "2", …, "20". Valor fuera de la grilla → se redondea a ¼. */
export function formatMeasureQty(qty: number): string {
  const v = Number.isFinite(qty) ? Math.max(0, Math.round(qty / MEASURE_QTY_STEP) * MEASURE_QTY_STEP) : 0;
  const whole = Math.floor(v);
  const quarters = Math.round((v - whole) / MEASURE_QTY_STEP) % 4;
  return `${whole > 0 ? whole : ""}${QUARTER_CHARS[quarters]}` || "0";
}

// ── Medida: límites y validación ─────────────────────────────────────────────────────────────

export const MEASURE_NAME_MAX = 40;
export const MEASURE_GRAMS_MIN = 0.1;
export const MEASURE_GRAMS_MAX = 2000;

/** trim + espacios internos colapsados. No cambia mayúsculas. */
export function cleanMeasureName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/** foodSearchText(cleanMeasureName(name)): "Tazá" y "taza" dan lo mismo. Clave de unicidad. */
export function measureNameKey(name: string): string {
  return foodSearchText(cleanMeasureName(name));
}

/** Gramos a 1 decimal (Math.round(x*10)/10). null si no es número finito. */
export function roundMeasureGrams(grams: number): number | null {
  if (typeof grams !== "number" || !Number.isFinite(grams)) return null;
  return Math.round((grams + Math.sign(grams) * Number.EPSILON) * 10) / 10;
}

export type MeasureField = "name" | "plural" | "grams";
export interface MeasureInput {
  name: string;
  plural: string | null;
  grams: number | null;
}
export interface MeasureIssue {
  field: MeasureField;
  message: string;
}

/**
 * Valida (sin unicidad, que la mira la base). Orden: name vacío → MEASURE_TEXT.nameRequired;
 * name > 40 → nameTooLong; plural (si viene, tras limpiar) > 40 → pluralTooLong;
 * grams null/no finito/redondeado < 0,1/> 2000 → gramsRange. Devuelve todos los problemas, uno por campo.
 */
export function validateMeasure(input: MeasureInput): MeasureIssue[] {
  const issues: MeasureIssue[] = [];
  const name = cleanMeasureName(input.name ?? "");
  if (name === "") issues.push({ field: "name", message: MEASURE_TEXT.nameRequired });
  else if (name.length > MEASURE_NAME_MAX) issues.push({ field: "name", message: MEASURE_TEXT.nameTooLong });
  const plural = input.plural === null || input.plural === undefined ? "" : cleanMeasureName(input.plural);
  if (plural.length > MEASURE_NAME_MAX) issues.push({ field: "plural", message: MEASURE_TEXT.pluralTooLong });
  const grams = input.grams === null || input.grams === undefined ? null : roundMeasureGrams(input.grams);
  if (grams === null || grams < MEASURE_GRAMS_MIN || grams > MEASURE_GRAMS_MAX) {
    issues.push({ field: "grams", message: MEASURE_TEXT.gramsRange });
  }
  return issues;
}

/**
 * Datos listos para guardar: name limpio, nameKey, plural limpio o null (vacío o igual al
 * automático → null), grams redondeado. Se llama después de validateMeasure: con datos inválidos
 * tira RangeError.
 */
export function normalizeMeasureInput(input: MeasureInput): {
  name: string;
  nameKey: string;
  plural: string | null;
  grams: number;
} {
  if (validateMeasure(input).length > 0) throw new RangeError("Medida inválida");
  const name = cleanMeasureName(input.name);
  const pluralRaw = input.plural === null ? "" : cleanMeasureName(input.plural);
  const plural = pluralRaw === "" || pluralRaw === pluralizeMeasureName(name) ? null : pluralRaw;
  return { name, nameKey: measureNameKey(name), plural, grams: roundMeasureGrams(input.grams as number) as number };
}

// ── Plural y singular (D6) ───────────────────────────────────────────────────────────────────

const PREPOSITIONS = new Set(["de", "del", "con", "sin", "para", "a", "al", "en", "por"]);

const PLURAL_ABBREVIATIONS: Record<string, string> = { cda: "cdas", cdita: "cditas", cdta: "cdtas", cc: "cc" };
const SINGULAR_ABBREVIATIONS: Record<string, string> = { cdas: "cda", cditas: "cdita", cdtas: "cdta", cc: "cc" };

const ACCENT_OFF: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u" };

/** Copia la mayúscula inicial de `original` en `word`. */
function keepCase(original: string, word: string): string {
  const first = original.charAt(0);
  if (first !== "" && first === first.toLocaleUpperCase("es") && first !== first.toLocaleLowerCase("es")) {
    return word.charAt(0).toLocaleUpperCase("es") + word.slice(1);
  }
  return word;
}

function pluralizeWord(word: string): string {
  const lower = word.toLocaleLowerCase("es");
  const abbr = PLURAL_ABBREVIATIONS[lower];
  if (abbr !== undefined) return keepCase(word, abbr);
  const last = lower.slice(-1);
  if (last === "") return word;
  // Aguda terminada en vocal con tilde + n ("porción", "cucharón"): pierde la tilde y suma "es".
  const acuteN = /([áéíóú])n$/.exec(lower);
  if (acuteN) {
    const stem = word.slice(0, -2) + (ACCENT_OFF[acuteN[1] ?? ""] ?? "") + word.slice(-1);
    return stem + "es";
  }
  if (last === "í" || last === "ú") return word + "es";
  if ("aeiouáéó".includes(last)) return word + "s";
  if (last === "z") return word.slice(0, -1) + "ces";
  if (last === "s" || last === "x") return word;
  return word + "es";
}

function singularizeWord(word: string): string {
  const lower = word.toLocaleLowerCase("es");
  const abbr = SINGULAR_ABBREVIATIONS[lower];
  if (abbr !== undefined) return keepCase(word, abbr);
  if (lower.endsWith("iones")) return word.slice(0, -5) + "ión";
  // "cucharones" → "cucharón" (aguda en -n que recupera la tilde).
  if (lower.endsWith("ones") && lower.length > 5) return word.slice(0, -4) + "ón";
  if (lower.endsWith("ces")) return word.slice(0, -3) + "z";
  if (/[dlnrj]es$/.test(lower)) return word.slice(0, -2);
  if (lower.endsWith("s") && lower.length > 1) return word.slice(0, -1);
  return word;
}

/** Aplica `fn` a cada palabra hasta la primera preposición; el resto queda igual. */
function mapHeadWords(name: string, fn: (word: string) => string): string {
  const words = cleanMeasureName(name).split(" ");
  let stopped = false;
  return words
    .map((w) => {
      if (stopped || w === "") return w;
      if (PREPOSITIONS.has(w.toLocaleLowerCase("es"))) {
        stopped = true;
        return w;
      }
      return fn(w);
    })
    .join(" ");
}

/**
 * Plural en español, palabra por palabra hasta la primera preposición (de, del, con, sin, para, a,
 * al, en, por): "taza de té" → "tazas de té"; "unidad mediana" → "unidades medianas".
 * Abreviaturas: cda → cdas, cdita → cditas, cdta → cdtas, cc → cc (sin cambio).
 * Por palabra: termina en vocal (con o sin tilde, salvo í/ú) → +s; en "ión" → "iones" (porción →
 * porciones); en "z" → "ces"; en "s" o "x" → sin cambio; en í/ú → +es; otra consonante (incluida y) → +es.
 * Conserva mayúsculas iniciales de cada palabra.
 */
export function pluralizeMeasureName(name: string): string {
  return mapHeadWords(name, pluralizeWord);
}

/**
 * Inversa aproximada (solo para parseUnitHint con N ≠ 1), mismas palabras: "iones" → "ión";
 * "ces" → "z"; consonante (d, l, n, r, j) + "es" → sin "es" ("unidades" → "unidad"); si no, una "s"
 * final se saca ("cucharadas" → "cucharada", "cuadraditos" → "cuadradito"). cdas → cda, cditas → cdita.
 */
export function singularizeMeasureName(name: string): string {
  return mapHeadWords(name, singularizeWord);
}

/** Plural a guardar en el ítem: el escrito a mano o el automático. */
export function resolvedMeasurePlural(m: { name: string; plural: string | null }): string {
  const written = m.plural === null ? "" : cleanMeasureName(m.plural);
  return written !== "" ? written : pluralizeMeasureName(m.name);
}

// ── Conversión y textos con números ──────────────────────────────────────────────────────────

/** quantityGrams del ítem: Math.round(qty × grams × 100) / 100 (Decimal(7,2)). */
export function measureItemGrams(qty: number, gramsPerUnit: number): number {
  const raw = qty * gramsPerUnit;
  return Math.round((raw + Math.sign(raw) * Number.EPSILON) * 100) / 100;
}

/** kcal redondeadas de `grams` gramos de un alimento con kcalPer100. */
export function measureKcal(kcalPer100: number, grams: number): number {
  return Math.round((kcalPer100 * grams) / 100);
}

/** "1 taza", "½ taza", "1½ tazas", "2 unidades medianas". qty ≤ 1 → singular; > 1 → plural. */
export function measureAmountText(qty: number, m: { name: string; plural: string }): string {
  return `${formatMeasureQty(qty)} ${qty <= 1 ? m.name : m.plural}`;
}

const gramsFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, useGrouping: true });
const kcalFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0, useGrouping: true });

/** "270 g", "6,3 g" (es-AR, máx. 1 decimal). */
export function formatGrams(grams: number): string {
  return `${gramsFormat.format(grams)} g`;
}

/** PDF: "1½ tazas (270 g)". */
export function measureWithGramsText(qty: number, m: { name: string; plural: string }, grams: number): string {
  return `${measureAmountText(qty, m)} (${formatGrams(grams)})`;
}

/** Desplegable del editor: "taza (180 g)". */
export function measureOptionLabel(m: { name: string; grams: number }): string {
  return `${m.name} (${formatGrams(m.grams)})`;
}

/** Lista de la ficha: "1 taza = 180 g · 234 kcal". */
export function measureListLine(m: { name: string; grams: number }, kcalPer100: number): string {
  return `1 ${m.name} = ${formatGrams(m.grams)} · ${kcalFormat.format(measureKcal(kcalPer100, m.grams))} kcal`;
}

/**
 * Vista previa del cuadro: { one: "1 taza de Arroz blanco, hervido = 180 g · 234 kcal",
 * two: "2 tazas = 360 g" }. null si los datos no validan.
 */
export function measurePreview(
  input: MeasureInput,
  food: { name: string; kcalPer100: number },
): { one: string; two: string } | null {
  if (validateMeasure(input).length > 0) return null;
  const name = cleanMeasureName(input.name);
  const grams = roundMeasureGrams(input.grams as number) as number;
  const plural = resolvedMeasurePlural({ name, plural: input.plural });
  return {
    one: `1 ${name} de ${food.name} = ${formatGrams(grams)} · ${kcalFormat.format(measureKcal(food.kcalPer100, grams))} kcal`,
    two: `2 ${plural} = ${formatGrams(measureItemGrams(2, grams))}`,
  };
}

// ── unitHint (D9) ────────────────────────────────────────────────────────────────────────────

export interface ParsedUnitHint {
  name: string;
  grams: number;
}

const UNIT_HINT_RE =
  /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s+(.+?)\s*[≈=~]\s*(\d+(?:[.,]\d+)?)\s*(g|gr|grs|gramos|ml|cc)\.?$/i;

function parseHintQty(text: string): number | null {
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(text);
  if (mixed) {
    const den = Number(mixed[3]);
    return den === 0 ? null : Number(mixed[1]) + Number(mixed[2]) / den;
  }
  const frac = /^(\d+)\/(\d+)$/.exec(text);
  if (frac) {
    const den = Number(frac[2]);
    return den === 0 ? null : Number(frac[1]) / den;
  }
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * "N <nombre> ≈ X <unidad>" (también "=", "~"). N: entero, decimal con coma o punto, "1/2" o
 * "1 1/2". Unidad: g, gr, grs, gramos, ml, cc (ml y cc como g, D8), con punto final opcional.
 * N ≠ 1 → grams = X / N (redondeado a 1 decimal) y nombre singularizado si N > 1.
 * null si: no matchea, N ≤ 0, el nombre limpio está vacío o supera 40, tiene dígitos, o los
 * gramos por unidad quedan fuera de [0,1; 2000].
 */
export function parseUnitHint(text: string | null | undefined): ParsedUnitHint | null {
  if (text === null || text === undefined) return null;
  const clean = cleanMeasureName(text);
  if (clean === "") return null;
  const m = UNIT_HINT_RE.exec(clean);
  if (!m) return null;
  const [, qtyText = "", nameText = "", totalText = ""] = m;
  const qty = parseHintQty(qtyText);
  if (qty === null || !(qty > 0)) return null;
  let name = cleanMeasureName(nameText);
  if (name === "" || /\d/.test(name)) return null;
  if (qty > 1) name = singularizeMeasureName(name);
  if (name.length > MEASURE_NAME_MAX) return null;
  const total = Number(totalText.replace(",", "."));
  const grams = roundMeasureGrams(total / qty);
  if (grams === null || grams < MEASURE_GRAMS_MIN || grams > MEASURE_GRAMS_MAX) return null;
  return { name, grams };
}

/** Texto para "Pasar a medida": cleanMeasureName(text).slice(0, 40). */
export function unitHintPrefillName(text: string): string {
  return cleanMeasureName(text).slice(0, MEASURE_NAME_MAX);
}

// ── Sugerencias del cuadro (UX de la HU) ─────────────────────────────────────────────────────

export const MEASURE_SUGGESTIONS: readonly { name: string; label: string }[] = [
  { name: "taza", label: "taza" },
  { name: "taza de té", label: "taza de té" },
  { name: "pocillo", label: "pocillo" },
  { name: "vaso", label: "vaso" },
  { name: "cda", label: "cda (cucharada)" },
  { name: "cdita", label: "cdita (cucharadita)" },
  { name: "unidad chica", label: "unidad chica" },
  { name: "unidad mediana", label: "unidad mediana" },
  { name: "unidad grande", label: "unidad grande" },
  { name: "feta", label: "feta" },
  { name: "rebanada", label: "rebanada" },
  { name: "plato", label: "plato" },
  { name: "porción", label: "porción" },
  { name: "puñado", label: "puñado" },
  { name: "pote", label: "pote" },
  { name: "lata", label: "lata" },
];

// ── Textos (SDD 4.2) ─────────────────────────────────────────────────────────────────────────

export const MEASURE_TEXT = {
  cardTitle: "Medidas caseras",
  cardHelp:
    "Cuánto pesa una taza, una cucharada o una unidad de este alimento. Se usan para armar planes en medidas caseras.",
  saraNote: "Las medidas son tuyas; la composición es de la tabla SARA 2 y no cambia",
  empty: "Todavía no tiene medidas caseras.",
  addButton: "Agregar medida",
  edit: "Editar",
  remove: "Quitar",
  moveUp: "Subir {name}",
  moveDown: "Bajar {name}",
  removeDescription: "Los planes que ya la usan no cambian.",
  removed: "Medida quitada",
  dialogNew: "Agregar medida",
  dialogEdit: "Editar medida",
  nameLabel: "Medida",
  namePlaceholder: "Ej: taza",
  suggestionsLabel: "Sugerencias de medidas",
  gramsLabel: "¿Cuántos gramos pesa 1?",
  gramsHint: "Para líquidos, 1 ml ≈ 1 g",
  pluralLink: "¿Se escribe distinto en plural?",
  pluralLabel: "Plural",
  pluralHint: "Ej: unidades medianas",
  save: "Guardar",
  cancel: "Cancelar",
  nameRequired: "Escribí el nombre de la medida (por ejemplo, taza)",
  nameTooLong: "El nombre puede tener hasta 40 caracteres",
  pluralTooLong: "El plural puede tener hasta 40 caracteres",
  gramsRange: "Escribí cuántos gramos pesa una (entre 0,1 y 2000)",
  saved: "Medida guardada",
  saveError: "No se pudo guardar la medida. Probá de nuevo.",
  notFound: "Esa medida ya no existe. Recargá la página.",
  sessionExpired: RECIPE_TEXT.sessionExpired,
  legacyButton: "Pasar a medida",
  modeAria: "Cómo cargar la cantidad",
  modeHousehold: "Medida casera",
  modeGrams: "Gramos",
  qtyLabel: "Cantidad",
  measureLabel: "Medida",
  addFromEditor: "Agregar una medida casera a este alimento",
  qtyGroupAria: "Cantidad de {food}",
  qtyError: "No se pudo cambiar la cantidad. Probá de nuevo.",
} as const;

/** "¿Quitar la medida «taza»?" */
export function removeMeasureTitle(name: string): string {
  return `¿Quitar la medida «${name}»?`;
}

/** "Este alimento ya tiene la medida «taza»" (con el nombre como está guardado). */
export function duplicateMeasureMessage(existingName: string): string {
  return `Este alimento ya tiene la medida «${existingName}»`;
}

/** "Medida guardada en Quinoa, cocida" */
export function measureSavedInMessage(foodName: string): string {
  return `Medida guardada en ${foodName}`;
}

/** "Tenías anotado: «porción chica». Pasalo a una medida para usarlo en los planes." */
export function legacyUnitHintText(text: string): string {
  return `Tenías anotado: «${cleanMeasureName(text)}». Pasalo a una medida para usarlo en los planes.`;
}

/** "Sumar ¼ a Arroz blanco, hervido" / "Restar ¼ a …" */
export function measureStepperAriaLabel(direction: 1 | -1, foodName: string): string {
  return `${direction === 1 ? "Sumar" : "Restar"} ¼ a ${foodName}`;
}
