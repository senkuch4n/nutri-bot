import { toReadingFrame, type BboxPage, type FrameWord } from "./bbox";
import { unitsMatch } from "./columns";
import { joinNameLines } from "./names";

/** Fila leída de una sección, antes de validar. */
export interface SaraRawRow {
  page: number;
  part: "A" | "B";
  name: string;
  /** Una celda por columna (20 en A, 19 en B), tal como viene en el PDF. null = celda vacía. */
  cells: (string | null)[];
  /** Texto crudo de la fila (nombre | celdas), para el reporte. */
  rawText: string;
  /** Distancia (pt) entre el centro del bloque de renglones del nombre y la fila de números. */
  nameCost: number;
  /** Dos valores cayeron en la misma columna. La fila se rechaza con COLUMNAS. */
  columnError?: string;
}

export interface SaraSection {
  page: number;
  part: "A" | "B";
  /** Número de tabla del título ("Tabla 7.A" → 7). null si no hay título arriba. */
  titleTable: number | null;
  titleText: string;
  rows: SaraRawRow[];
  /** Errores de lector de toda la sección (encabezado de unidades distinto, partición imposible). */
  errors: string[];
}

// Tolerancias en puntos (medidas sobre el PDF completo, SDD 3.3).
const LINE_TOL = 1.5;
const ROW_TOL = 2.5;
const VALUE_ZONE_MARGIN = 12;
const NAME_MAX_DISTANCE = 40;
const MAX_LINES_PER_NAME = 6;
const MAX_GAP_IN_NAME = 14;
const EMPTY_GROUP_COST = 1000;

const UNIT_TOKEN = /^(Kcal|kcal|g|mg|µg|μg)$/;
const VALUE_TOKEN = /^-?[\d.,]*\d[\d.,]*$/;
const TITLE_RE = /tabla\s*(\d+)\s*\.?\s*([AB])?/i;
const TITLE_KIND_RE = /macronutrientes|vitaminas/i;

interface Line {
  vc: number;
  words: FrameWord[];
  text: string;
}

/** Agrupa palabras en renglones por su centro vertical (v), con el primer centro como ancla. */
function groupLines(words: readonly FrameWord[], tol: number): Line[] {
  const sorted = [...words].sort((a, b) => a.vc - b.vc || a.u0 - b.u0);
  const lines: { vc: number; words: FrameWord[] }[] = [];
  for (const w of sorted) {
    const last = lines.at(-1);
    if (last && Math.abs(last.vc - w.vc) <= tol) last.words.push(w);
    else lines.push({ vc: w.vc, words: [w] });
  }
  return lines.map((l) => {
    const ws = l.words.sort((a, b) => a.u0 - b.u0);
    return { vc: l.vc, words: ws, text: ws.map((w) => w.text).join(" ") };
  });
}

function isUnitHeader(line: Line): boolean {
  const toks = line.words.map((w) => w.text);
  return (
    toks.length >= 19 &&
    toks.every((t) => UNIT_TOKEN.test(t)) &&
    /^(kcal|g)$/i.test(toks[0] ?? "")
  );
}

/**
 * Partición óptima de los renglones de nombre (ordenados por v) en grupos contiguos y en orden,
 * uno por fila numérica, minimizando Σ |centro(grupo) − v(fila)|. Máximo 6 renglones por grupo y
 * 14 pt entre renglones consecutivos del grupo. Un grupo vacío cuesta 1000.
 * Devuelve, por fila, los índices de los renglones asignados. Si no hay partición posible,
 * todos los grupos vacíos.
 */
export function assignNameLines(lineYs: readonly number[], rowYs: readonly number[]): number[][] {
  const n = lineYs.length;
  const m = rowYs.length;
  if (m === 0) return [];
  const INF = Number.POSITIVE_INFINITY;
  const W = m + 1;
  const dp = new Float64Array((n + 1) * W).fill(INF);
  const back = new Int32Array((n + 1) * W).fill(-1);
  const at = (a: ArrayLike<number>, i: number) => a[i] as number;
  dp[0] = 0;
  for (let j = 1; j <= m; j++) {
    const rowY = at(rowYs, j - 1);
    for (let i = 0; i <= n; i++) {
      // grupo vacío para la fila j
      const empty = at(dp, i * W + j - 1) + EMPTY_GROUP_COST;
      if (empty < at(dp, i * W + j)) {
        dp[i * W + j] = empty;
        back[i * W + j] = i;
      }
      for (let k = Math.max(0, i - MAX_LINES_PER_NAME); k < i; k++) {
        const prev = at(dp, k * W + j - 1);
        if (prev === INF) continue;
        let ok = true;
        for (let x = k; x < i - 1; x++) {
          if (at(lineYs, x + 1) - at(lineYs, x) > MAX_GAP_IN_NAME) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        const cost = prev + Math.abs((at(lineYs, k) + at(lineYs, i - 1)) / 2 - rowY);
        if (cost < at(dp, i * W + j)) {
          dp[i * W + j] = cost;
          back[i * W + j] = k;
        }
      }
    }
  }
  const groups: number[][] = Array.from({ length: m }, () => []);
  if (at(dp, n * W + m) === INF) return groups;
  let i = n;
  for (let j = m; j >= 1; j--) {
    const k = at(back, i * W + j);
    const group = groups[j - 1] as number[];
    for (let x = k; x < i; x++) group.push(x);
    i = k;
  }
  return groups;
}

/** Secciones (partes A y B) de una página, con sus filas. */
export function extractSections(page: BboxPage): SaraSection[] {
  const words = toReadingFrame(page);
  const lines = groupLines(words, LINE_TOL);
  const headers = lines.filter(isUnitHeader);
  const titles = lines.filter((l) => TITLE_RE.test(l.text) && TITLE_KIND_RE.test(l.text));
  const sections: SaraSection[] = [];

  for (const header of headers) {
    const units = header.words.map((w) => w.text);
    const part: "A" | "B" = units.length === 20 ? "A" : "B";
    const errors: string[] = [];
    if (!unitsMatch(part, units)) {
      errors.push(`COLUMNAS: el renglón de unidades no coincide con la parte ${part} («${units.join(" ")}»)`);
    }
    const titleLine = titles.filter((t) => t.vc < header.vc).at(-1);
    const titleMatch = titleLine ? TITLE_RE.exec(titleLine.text) : null;
    const nextTitle = titles.find((t) => t.vc > header.vc);
    const bottom = nextTitle ? nextTitle.vc : Number.POSITIVE_INFINITY;

    const region = words.filter((w) => w.vc > header.vc + 2 && w.vc < bottom);
    const zoneStart = (header.words[0]?.u0 ?? 0) - VALUE_ZONE_MARGIN;
    const centers = header.words.map((w) => w.uc);
    const isValue = (w: FrameWord) => w.uc >= zoneStart && VALUE_TOKEN.test(w.text);
    const valueLines = groupLines(region.filter(isValue), ROW_TOL);
    const nameLinesAll = groupLines(
      region.filter((w) => !isValue(w)),
      LINE_TOL,
    ).filter((l) => !/ENNYS|SARA 2:/.test(l.text) && !l.text.startsWith("*"));

    const rowYs = valueLines.map((l) => l.vc);
    const nameLines =
      rowYs.length === 0
        ? []
        : nameLinesAll.filter(
            (l) =>
              l.vc >= (rowYs[0] as number) - NAME_MAX_DISTANCE &&
              l.vc <= (rowYs[rowYs.length - 1] as number) + NAME_MAX_DISTANCE,
          );
    const groups = assignNameLines(
      nameLines.map((l) => l.vc),
      rowYs,
    );
    if (nameLines.length > 0 && groups.every((g) => g.length === 0)) {
      errors.push("No se pudieron asignar los renglones de nombre a las filas");
    }

    const rows: SaraRawRow[] = valueLines.map((vl, r) => {
      const cells: (string | null)[] = new Array(centers.length).fill(null);
      const collisions: string[] = [];
      for (const w of vl.words) {
        let best = 0;
        for (let c = 1; c < centers.length; c++) {
          if (Math.abs((centers[c] as number) - w.uc) < Math.abs((centers[best] as number) - w.uc)) best = c;
        }
        if (cells[best] !== null) collisions.push(`columna ${best + 1}: «${cells[best]}» y «${w.text}»`);
        else cells[best] = w.text;
      }
      const groupLinesOfRow = (groups[r] ?? []).map((i) => nameLines[i] as Line);
      const name = joinNameLines(groupLinesOfRow.map((l) => l.text));
      const firstLine = groupLinesOfRow[0];
      const lastLine = groupLinesOfRow.at(-1);
      const nameCost =
        firstLine && lastLine ? Math.abs((firstLine.vc + lastLine.vc) / 2 - vl.vc) : EMPTY_GROUP_COST;
      const row: SaraRawRow = {
        page: page.pageNumber,
        part,
        name,
        cells,
        rawText: `${name} | ${cells.map((c) => c ?? "·").join(" ")}`,
        nameCost: Math.round(nameCost * 100) / 100,
      };
      if (collisions.length > 0) row.columnError = `dos valores en la misma columna (${collisions.join("; ")})`;
      return row;
    });

    sections.push({
      page: page.pageNumber,
      part,
      titleTable: titleMatch ? Number(titleMatch[1]) : null,
      titleText: titleLine?.text ?? "",
      rows,
      errors,
    });
  }
  return sections;
}
