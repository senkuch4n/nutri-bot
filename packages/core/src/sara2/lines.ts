import { normalizePdfText } from "../recipe-import/text";
import type { BboxPage, BboxWord } from "./bbox";

// HU-020 (SDD 5.3): geometría de renglones de `pdftotext -bbox`, movida tal cual de
// recipe-import/extract.ts para que la reusen el importador de recetas y el de planes.

export interface Word extends BboxWord {
  h: number;
  yc: number;
}

/** Tramo de una línea (las líneas se cortan donde hay un hueco grande: columnas). */
export interface Seg {
  words: Word[];
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  yc: number;
  h: number;
  text: string;
}

export interface Line extends Seg {
  segs: Seg[];
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function makeSeg(words: Word[]): Seg {
  const ws = [...words].sort((a, b) => a.x0 - b.x0);
  return {
    words: ws,
    x0: Math.min(...ws.map((w) => w.x0)),
    x1: Math.max(...ws.map((w) => w.x1)),
    y0: Math.min(...ws.map((w) => w.y0)),
    y1: Math.max(...ws.map((w) => w.y1)),
    yc: ws.reduce((a, w) => a + w.yc, 0) / ws.length,
    h: median(ws.map((w) => w.h)),
    text: normalizePdfText(ws.map((w) => w.text).join(" ")),
  };
}

/** Palabra rotada: título de sección vertical (F2). Las palabras de 1–3 letras no cuentan (viñetas). */
export function isRotated(w: BboxWord): boolean {
  return w.text.trim().length >= 4 && w.y1 - w.y0 > (w.x1 - w.x0) * 1.5;
}

export function buildLines(words: Word[], tolerance: number): Line[] {
  const sorted = [...words].sort((a, b) => a.yc - b.yc || a.x0 - b.x0);
  const groups: Word[][] = [];
  let current: Word[] = [];
  let currentYc = 0;
  for (const w of sorted) {
    if (current.length > 0 && Math.abs(w.yc - currentYc) <= tolerance) {
      current.push(w);
      currentYc = current.reduce((a, x) => a + x.yc, 0) / current.length;
    } else {
      if (current.length > 0) groups.push(current);
      current = [w];
      currentYc = w.yc;
    }
  }
  if (current.length > 0) groups.push(current);
  return groups.map((g) => {
    const line = makeSeg(g);
    // Cortar en tramos donde el hueco entre palabras supera 1,5 × la altura (otra columna).
    const segs: Seg[] = [];
    let buf: Word[] = [];
    for (const w of line.words) {
      const prev = buf[buf.length - 1];
      if (prev && w.x0 - prev.x1 > 1.5 * Math.min(prev.h, w.h)) {
        segs.push(makeSeg(buf));
        buf = [];
      }
      buf.push(w);
    }
    if (buf.length > 0) segs.push(makeSeg(buf));
    return { ...line, segs };
  });
}

/** Palabras de la página con alto y centro calculados (sin las vacías). */
export function pageWords(page: BboxPage): Word[] {
  return page.words
    .filter((w) => w.text.trim() !== "")
    .map((w) => ({ ...w, h: w.y1 - w.y0, yc: (w.y0 + w.y1) / 2 }));
}

/** Palabras con texto, sin rotadas (isRotated), tolerancia 0,5 × mediana de alto (fallback 10). */
export function pageLines(page: BboxPage): Line[] {
  const flat = pageWords(page).filter((w) => !isRotated(w));
  const medianH = median(flat.map((w) => w.h)) || 10;
  return buildLines(flat, 0.5 * medianH);
}
