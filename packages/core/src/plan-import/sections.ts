// HU-020 (SDD 5.2, T5): secciones reconocidas del formato de plan (Canva). Para sumar una sección
// nueva cuando lleguen otros PDF (D14/D15): agregar una entrada a KNOWN_SECTIONS y su test.
import { plainText } from "../recipe-import/text";

export type PlanSectionKey =
  | "COVER"
  | "RECOMMENDATIONS"
  | "DAILY_FOODS"
  | "OCCASIONAL_FOODS"
  | "BREAKFAST_SNACK"
  | "LUNCH_DINNER"
  | "SNACKS"
  | "REPLACEMENTS";

export type PlanSectionKind = "cover" | "text" | "menu" | "options";

/** plainText sin espacios: "D E S AY U N O" y "DESAYUNO" dan lo mismo. */
export function compactHeading(text: string): string {
  return plainText(text).replace(/ /g, "");
}

export const KNOWN_SECTIONS: ReadonlyArray<{
  key: PlanSectionKey;
  match: (compact: string) => boolean;
  kind: PlanSectionKind;
  textTitle: string | null;
}> = [
  { key: "COVER", match: (c) => c === "plannutricional", kind: "cover", textTitle: null },
  { key: "RECOMMENDATIONS", match: (c) => c === "recomendaciones", kind: "text", textTitle: "Recomendaciones" },
  {
    key: "DAILY_FOODS",
    match: (c) => c === "alimentosdeconsumodiario",
    kind: "text",
    textTitle: "Alimentos de consumo diario",
  },
  {
    key: "OCCASIONAL_FOODS",
    match: (c) => c === "alimentosdeconsumoocasional",
    kind: "text",
    textTitle: "Alimentos de consumo ocasional",
  },
  { key: "BREAKFAST_SNACK", match: (c) => c === "desayunoymerienda", kind: "menu", textTitle: null },
  { key: "LUNCH_DINNER", match: (c) => c === "almuerzoycena", kind: "menu", textTitle: null },
  { key: "SNACKS", match: (c) => c === "colacionesopcionales" || c === "colaciones", kind: "options", textTitle: null },
  // El renglón "REEMPLAZO (Alimentos ricos en …)" se agrega como subtítulo dentro del cuerpo.
  { key: "REPLACEMENTS", match: (c) => c.startsWith("reemplazo"), kind: "text", textTitle: "Reemplazos" },
];

/** Más palabras que esto no es un encabezado ("Reemplazo de la carne por legumbres en la cena…"). */
const MAX_HEADING_WORDS = 8;

function wordCount(text: string): number {
  return plainText(text).split(" ").filter(Boolean).length;
}

/** Letras espaciadas: 4+ fichas y casi todas de 1–3 caracteres ("L I S TA D E"). */
export function isLetterSpaced(text: string): boolean {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 4) return false;
  return tokens.filter((t) => t.length <= 3).length / tokens.length >= 0.7;
}

export function matchSectionHeading(segText: string): PlanSectionKey | null {
  const compact = compactHeading(segText);
  if (compact === "") return null;
  if (!isLetterSpaced(segText) && wordCount(segText) > MAX_HEADING_WORDS) return null;
  return KNOWN_SECTIONS.find((s) => s.match(compact))?.key ?? null;
}

/** Sin minúsculas y con letras, 1–8 palabras (o letras espaciadas). */
export function isHeadingLike(segText: string): boolean {
  const t = segText.trim();
  if (!/\p{L}/u.test(t) || /\p{Ll}/u.test(t)) return false;
  if (isLetterSpaced(t)) return true;
  const n = t.split(/\s+/).filter(Boolean).length;
  return n >= 1 && n <= MAX_HEADING_WORDS;
}

export function sectionKind(key: PlanSectionKey): PlanSectionKind {
  return KNOWN_SECTIONS.find((s) => s.key === key)!.kind;
}

/** Rótulos de adorno que se ignoran en menú y colaciones (comparados con plainText). */
export const DECORATIVE_LABELS: readonly string[] = ["opciones", "de colaciones", "opciones de colaciones"];

export function isDecorativeLabel(text: string): boolean {
  return DECORATIVE_LABELS.includes(plainText(text));
}

export const PLATE_RULE_TITLE = "Cómo armar el plato";
