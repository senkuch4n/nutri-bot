/** Salida de `pdftotext -bbox`: páginas y palabras con su caja (coordenadas PDF, y hacia abajo). */
export interface BboxWord {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  text: string;
}

export interface BboxPage {
  pageNumber: number;
  width: number;
  height: number;
  words: BboxWord[];
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m] ?? m);
}

const PAGE_RE = /<page\s+width="([\d.]+)"\s+height="([\d.]+)"\s*>([\s\S]*?)<\/page>/g;
const WORD_RE =
  /<word\s+xMin="(-?[\d.]+)"\s+yMin="(-?[\d.]+)"\s+xMax="(-?[\d.]+)"\s+yMax="(-?[\d.]+)"\s*>([\s\S]*?)<\/word>/g;

/** Lee el XHTML de `pdftotext -bbox`. Las páginas se numeran desde firstPageNumber (default 1). */
export function parseBboxXhtml(xhtml: string, firstPageNumber = 1): BboxPage[] {
  const pages: BboxPage[] = [];
  for (const m of xhtml.matchAll(PAGE_RE)) {
    const words: BboxWord[] = [];
    for (const w of (m[3] ?? "").matchAll(WORD_RE)) {
      words.push({
        x0: Number(w[1]),
        y0: Number(w[2]),
        x1: Number(w[3]),
        y1: Number(w[4]),
        text: decodeEntities(w[5] ?? ""),
      });
    }
    pages.push({
      pageNumber: firstPageNumber + pages.length,
      width: Number(m[1]),
      height: Number(m[2]),
      words,
    });
  }
  return pages;
}

/**
 * Palabra en el marco de lectura de la tabla. El texto de las tablas está rotado 90°: las filas
 * avanzan en x creciente y las columnas en y decreciente. u = eje de columnas (izquierda →
 * derecha), v = eje de filas (arriba → abajo).
 */
export interface FrameWord {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  uc: number;
  vc: number;
  text: string;
}

export function toReadingFrame(page: BboxPage): FrameWord[] {
  return page.words.map((w) => {
    const u0 = page.height - w.y1;
    const u1 = page.height - w.y0;
    return { u0, u1, v0: w.x0, v1: w.x1, uc: (u0 + u1) / 2, vc: (w.x0 + w.x1) / 2, text: w.text };
  });
}
