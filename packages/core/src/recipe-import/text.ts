// HU-018a-2: normalización del texto que sale de pdftotext (recetarios). Puro, sin red ni base.

/** Fracciones que se dejan como están ("¾ de taza" se lee mejor que "3⁄4 de taza"). */
const VULGAR_FRACTIONS = /[¼-¾⅐-⅞]/;

/** NFKC (ligaduras ﬁ→fi), comillas y guiones tipográficos a ASCII, espacios colapsados. */
export function normalizePdfText(s: string): string {
  let out = "";
  for (const ch of s) out += VULGAR_FRACTIONS.test(ch) ? ch : ch.normalize("NFKC");
  return out
    .replace(/[‘’‚‛´`]/g, "'")
    .replace(/[“”„‟¨]/g, '"')
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/⁄/g, "/") // barra de fracción ("1⁄2")
    .replace(/[  -​  　\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Viñetas que aparecen en los recetarios. La lista de la SDD más "°", "»", "◦", "▪" y "‣", que también
 * se usan como viñeta en algunos archivos.
 */
export const BULLETS: readonly string[] = ["×", "•", "॰", ">", "+", "-", "–", "*", "·", "°", "»", "◦", "▪", "‣"];

/** "× Lentejas 500g" → { bullet: "×", text: "Lentejas 500g" }. "•Polenta" también (viñeta pegada). */
export function stripBullet(line: string): { bullet: string | null; text: string } {
  const t = line.trim();
  const first = t.charAt(0);
  if (first !== "" && BULLETS.includes(first)) {
    const rest = t.slice(1).trim();
    // "-1" o "+2" pegados a un número no son viñetas.
    if ((first === "-" || first === "+") && /^\d/.test(t.slice(1))) return { bullet: null, text: t };
    return { bullet: first, text: rest };
  }
  return { bullet: null, text: t };
}

/** Sin tildes, minúsculas, sin puntuación. Para comparar títulos y etiquetas. */
export function plainText(s: string): string {
  return normalizePdfText(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
