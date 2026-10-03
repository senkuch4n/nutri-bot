import { normalizePdfText, stripBullet } from "./text";

// HU-018a-2 (D5): una línea de ingrediente del recetario → label, gramos, medida casera, c.n. y
// avisos. Regla dura: `grams` sale SOLO de un token explícito en g/kg del texto ("500g", "100 g",
// "1,5 kg"). Nunca se convierte una medida casera ni un volumen a gramos.

export type IngredientLineFlag =
  | "HOUSEHOLD_ONLY" // el texto no dice los gramos: grams null, hay que completarlo
  | "VOLUME_ONLY" // solo cc/ml: no se convierte a gramos (D5, 12-D11)
  | "APPROX" // "aprox." / "en crudo" / "en cocido" junto a los gramos
  | "AMBIGUOUS_GRAMS" // dos o más cantidades en g distintas (o un rango): grams null
  | "MULTI_FOOD"; // "Una cebolla y morrón picados": probablemente son dos ingredientes

export interface ParsedIngredientLine {
  /** La línea original, ya normalizada y sin viñeta. */
  rawText: string;
  /** El texto sin la cantidad en g ni la medida casera ("Lentejas", "Puré de calabaza"). */
  label: string;
  /** SOLO de un token explícito "500g", "100 g", "1,5 kg", "1.5kg" (kg × 1000). */
  grams: number | null;
  /** "una taza", "2 cditas", "¾ de pocillo de café", "una unidad". */
  household: string | null;
  /** "c.n", "c/n", "cantidad necesaria", "a gusto". */
  noQuantity: boolean;
  flags: IngredientLineFlag[];
}

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const AFTER = String.raw`(?![a-zA-ZñÑáéíóúÁÉÍÓÚ])`;
const GRAM_UNIT = String.raw`(?:kgs?|kilos?|gramos|grs?|g)`;

/** Token de gramos: número + unidad. El número no puede venir pegado a otro número o fracción. */
export const GRAM_TOKEN_SOURCE = String.raw`(?<![\d.,/])(${NUM})\s*(${GRAM_UNIT})${AFTER}\.?`;
const gramRe = () => new RegExp(GRAM_TOKEN_SOURCE, "gi");
const RANGE_RE = new RegExp(String.raw`(?<![\d.,/])${NUM}\s*(?:a|-|y|o)\s*${NUM}\s*${GRAM_UNIT}${AFTER}`, "i");
const VOLUME_RE = new RegExp(String.raw`(?<![\d.,/])${NUM}\s*(?:cc|ml|cm3|litros?|lts?|l)${AFTER}\.?`, "i");
const NO_QUANTITY_RE = /(?<![a-zA-ZñÑ])c\s*[./]\s*n(?![a-zA-ZñÑ])\.?|cantidad necesaria|a gusto/i;
const APPROX_RE = /aprox|\ben crudo\b|\ben cocido\b/i;

const QTY = String.raw`(?:\d+\s+\d+\s*/\s*\d+|\d+\s*/\s*\d+|\d+(?:[.,]\d+)?(?:\s*[¼½¾⅓⅔⅛])?|[¼½¾⅓⅔⅛]|una|un|uno|media|medio|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)`;
const UNITS = [
  "tazas?", "tacitas?", "cdas?", "cditas?", "cucharadas?", "cucharaditas?", "cucharitas?", "pocillos?", "vasos?",
  "unidad(?:es)?", "u", "dientes?", "hojas?", "fetas?", "tajadas?", "rodajas?", "rebanadas?", "puñados?", "pizcas?",
  "atados?", "latas?", "sobres?", "sobrecitos?", "barritas?", "copas?", "chorritos?", "ramitas?", "planchas?",
].join("|");
const UNIT_SUFFIX = String.raw`(?:\s+(?:de\s+)?(?:soperas?|t[eé]|caf[eé]|postre|grandes?|chic[oa]s?|median[oa]s?|tamaño\s+\S+))*`;
const HOUSEHOLD_RE = new RegExp(
  String.raw`(?<![a-zA-ZñÑáéíóú\d])${QTY}\s*(?:de\s+)?(?:${UNITS})${AFTER}${UNIT_SUFFIX}`,
  "i",
);

/** "1,5" → 1.5 · "1.5" → 1.5 · "1.000" → 1000 (separador de miles). */
function parseAmount(raw: string): number {
  if (/^\d{1,3}\.\d{3}$/.test(raw)) return Number(raw.replace(".", ""));
  return Number(raw.replace(",", "."));
}

/** Valores en gramos de los tokens explícitos de la línea, en orden. kg × 1000. */
export function gramValuesIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(gramRe())) {
    const value = parseAmount(m[1]!);
    const unit = m[2]!.toLowerCase();
    const grams = unit.startsWith("k") ? Math.round(value * 1000 * 100) / 100 : value;
    if (Number.isFinite(grams) && grams > 0) out.push(grams);
  }
  return out;
}

function firstIndex(text: string, re: RegExp): number {
  const m = new RegExp(re.source, re.flags.replace("g", "")).exec(text);
  return m ? m.index : -1;
}

function cleanLabel(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:.\-]+|[\s,;:.\-(]+$/g, "")
    .trim();
}

function stripQuantities(text: string): string {
  return text
    .replace(/\([^)]*\)?/g, " ")
    .replace(RANGE_RE, " ")
    .replace(gramRe(), " ")
    .replace(new RegExp(VOLUME_RE.source, "gi"), " ")
    .replace(new RegExp(HOUSEHOLD_RE.source, "gi"), " ")
    .replace(new RegExp(NO_QUANTITY_RE.source, "gi"), " ")
    .replace(/\baprox\.?/gi, " ")
    .replace(/^\s*de\s+/i, "");
}

/** Sin medida casera: el volumen entre paréntesis es la única cantidad ("Agua (200cc)"). */
function householdLess(text: string): boolean {
  return !HOUSEHOLD_RE.test(text);
}

export function parseIngredientLine(raw: string): ParsedIngredientLine {
  const rawText = stripBullet(normalizePdfText(raw)).text;
  const flags: IngredientLineFlag[] = [];

  const values = gramValuesIn(rawText);
  const distinct = [...new Set(values)];
  const ambiguous = distinct.length > 1 || RANGE_RE.test(rawText);
  const grams = !ambiguous && distinct.length === 1 ? distinct[0]! : null;
  // El volumen cuenta si está fuera de los paréntesis ("Huevo una unidad (o 100cc de bebida…)" no es VOLUME_ONLY).
  const hasVolume = VOLUME_RE.test(rawText.replace(/\([^)]*\)?/g, " ")) || (householdLess(rawText) && VOLUME_RE.test(rawText));
  const noQuantity = grams === null && !ambiguous && NO_QUANTITY_RE.test(rawText);
  const householdMatch = HOUSEHOLD_RE.exec(rawText);
  const household = householdMatch ? householdMatch[0].trim() : null;

  // Label: el texto hasta la primera cantidad o paréntesis. Si la línea empieza con la cantidad
  // ("500g de harina"), el texto sin las cantidades.
  const cuts = [
    firstIndex(rawText, gramRe()),
    firstIndex(rawText, RANGE_RE),
    firstIndex(rawText, VOLUME_RE),
    firstIndex(rawText, NO_QUANTITY_RE),
    householdMatch ? householdMatch.index : -1,
    rawText.indexOf("("),
    firstIndex(rawText, /\.\s*(?=[A-ZÁÉÍÓÚÑ])/),
  ].filter((i) => i >= 0);
  const cut = cuts.length > 0 ? Math.min(...cuts) : rawText.length;
  let label = cleanLabel(rawText.slice(0, cut));
  if (label === "") label = cleanLabel(stripQuantities(rawText));

  if (ambiguous) flags.push("AMBIGUOUS_GRAMS");
  if (grams !== null && APPROX_RE.test(rawText)) flags.push("APPROX");
  if (grams === null && !ambiguous && hasVolume) flags.push("VOLUME_ONLY");
  if (grams === null && !ambiguous && !hasVolume && !noQuantity) flags.push("HOUSEHOLD_ONLY");
  if (/\s(?:y|e)\s|,\s*[a-zA-ZñÑáéíóú]|\s\+\s/i.test(label)) flags.push("MULTI_FOOD");

  return { rawText, label, grams, household, noQuantity, flags };
}
