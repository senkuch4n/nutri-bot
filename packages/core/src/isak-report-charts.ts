import { SOMATOCHART_DOMAIN, SOMATOCHART_VERTICES } from "./isak";
import type { CompositionShares, IsakReportBar, IsakTissueKey } from "./isak-report";
import { formatFixedEs } from "./patient-formula-data";

/**
 * HU-007: geometría de los gráficos del informe antropométrico. Todas las coordenadas van en
 * puntos PDF, con origen arriba a la izquierda (y hacia abajo). El PDF solo dibuja.
 */

const SQRT3 = Math.sqrt(3);
const MINUS = "−";
const intLabel = (n: number) => (n < 0 ? `${MINUS}${Math.abs(n)}` : String(n));

// ── Barras de perímetros (anterior vs actual) ──────────────────────────────

export interface GirthBarsLayout {
  width: number;
  height: number;
  axisMax: number;
  ticks: Array<{ x: number; label: string }>;
  axisY: number;
  groups: Array<{
    key: IsakReportBar["key"];
    label: string;
    labelX: number;
    labelY: number;
    bars: Array<{
      series: "previous" | "current";
      x: number;
      y: number;
      width: number;
      height: number;
      valueLabel: string;
      valueX: number;
      valueY: number;
    }>;
  }>;
}

export const GIRTH_BARS = { labelWidth: 96, valueWidth: 32, barHeight: 7, barGap: 2, groupGap: 7, top: 4, axisHeight: 14 } as const;

export function buildGirthBarsLayout(bars: IsakReportBar[], opts: { width: number; hasPrevious: boolean }): GirthBarsLayout {
  const G = GIRTH_BARS;
  const series: Array<"previous" | "current"> = opts.hasPrevious ? ["previous", "current"] : ["current"];
  const plotX = G.labelWidth;
  const plotWidth = opts.width - G.labelWidth - G.valueWidth;
  const values = bars.flatMap((b) => series.map((s) => b[s])).filter((v): v is number => v !== null);
  const maxValue = values.length > 0 ? Math.max(...values) : 0;
  const axisMax = Math.max(10, Math.ceil(maxValue / 10) * 10);
  const xOf = (v: number) => plotX + (v / axisMax) * plotWidth;

  const groupHeight = series.length * G.barHeight + (series.length - 1) * G.barGap;
  let y = G.top;
  const groups: GirthBarsLayout["groups"] = bars.map((b, gi) => {
    if (gi > 0) y += G.groupGap;
    const groupTop = y;
    const groupBars = series.map((s, si) => {
      const barY = groupTop + si * (G.barHeight + G.barGap);
      const value = b[s];
      const valueY = barY + G.barHeight - 1.2;
      if (value === null) {
        return { series: s, x: plotX, y: barY, width: 0, height: G.barHeight, valueLabel: "Sin dato", valueX: plotX + 3, valueY };
      }
      return {
        series: s,
        x: plotX,
        y: barY,
        width: xOf(value) - plotX,
        height: G.barHeight,
        valueLabel: formatFixedEs(value, b.decimals),
        valueX: xOf(value) + 3,
        valueY,
      };
    });
    y = groupTop + groupHeight;
    return { key: b.key, label: b.label, labelX: G.labelWidth - 6, labelY: groupTop + groupHeight / 2 + 2.5, bars: groupBars };
  });
  const axisY = y + 3;
  const ticks: GirthBarsLayout["ticks"] = [];
  for (let t = 0; t <= axisMax; t += 10) ticks.push({ x: xOf(t), label: String(t) });
  return { width: opts.width, height: axisY + G.axisHeight, axisMax, ticks, axisY, groups };
}

// ── Somatocarta (contorno de Reuleaux) ─────────────────────────────────────

type Pt = { x: number; y: number };

/** Punto (X, Y) de la carta a coordenadas euclídeas (X, Y/√3), donde el triángulo es equilátero. */
const toEuclid = (p: Pt): Pt => ({ x: p.x, y: p.y / SQRT3 });
const fromEuclid = (p: Pt): Pt => ({ x: p.x, y: p.y * SQRT3 });
const SIDE = 12;

/** Punto medio del arco opuesto a `v`: desde v, a distancia SIDE, en la dirección del origen (centroide). */
function arcMidpoint(v: Pt): Pt {
  const e = toEuclid(v);
  const len = Math.hypot(e.x, e.y);
  return fromEuclid({ x: e.x - (e.x / len) * SIDE, y: e.y - (e.y / len) * SIDE });
}

/** Punto medio de cada arco, en unidades de la carta (X, Y). El eje de cada vértice pasa por el origen y termina acá. */
export const SOMATOCHART_ARC_MIDPOINTS: {
  oppositeEndomorph: { x: number; y: number };
  oppositeMesomorph: { x: number; y: number };
  oppositeEctomorph: { x: number; y: number };
} = {
  oppositeEndomorph: arcMidpoint(SOMATOCHART_VERTICES.endomorph),
  oppositeMesomorph: arcMidpoint(SOMATOCHART_VERTICES.mesomorph),
  oppositeEctomorph: arcMidpoint(SOMATOCHART_VERTICES.ectomorph),
};

export interface SomatochartLayout {
  width: number;
  height: number;
  /** Radio del arco en puntos (= lado del triángulo = 12 unidades X × escala). */
  radius: number;
  contourPath: string;
  axes: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  gridX: Array<{ x: number; label: string }>;
  gridY: Array<{ y: number; label: string }>;
  plot: { left: number; top: number; right: number; bottom: number };
  vertexLabels: Array<{ text: "Mesomorfia" | "Endomorfia" | "Ectomorfia"; x: number; y: number; anchor: "start" | "middle" | "end" }>;
  points: { current: { cx: number; cy: number } | null; previous: { cx: number; cy: number } | null };
}

export const SOMATOCHART_PADDING = { left: 18, right: 6, top: 14, bottom: 14 } as const;

/** Mismo criterio que la somatocarta del panel: el dominio base, ampliado a pares para incluir los puntos. */
function domainOf(base: readonly [number, number], values: number[]): [number, number] {
  const min = Math.min(base[0], ...values.map((v) => Math.floor(v / 2) * 2));
  const max = Math.max(base[1], ...values.map((v) => Math.ceil(v / 2) * 2));
  return [min, max];
}

export function buildSomatochartLayout(opts: {
  width: number;
  current: { x: number; y: number } | null;
  previous: { x: number; y: number } | null;
}): SomatochartLayout {
  const P = SOMATOCHART_PADDING;
  const pts = [opts.current, opts.previous].filter((p): p is Pt => p !== null);
  const [xmin, xmax] = domainOf(SOMATOCHART_DOMAIN.x, pts.map((p) => p.x));
  const [ymin, ymax] = domainOf(SOMATOCHART_DOMAIN.y, pts.map((p) => p.y));
  const s = (opts.width - P.left - P.right) / (xmax - xmin);
  const px = (x: number) => P.left + (x - xmin) * s;
  const py = (y: number) => P.top + ((ymax - y) * s) / SQRT3;
  const height = P.top + ((ymax - ymin) * s) / SQRT3 + P.bottom;
  const radius = SIDE * s;

  const V = SOMATOCHART_VERTICES;
  const f = (n: number) => n.toFixed(2);
  const r = f(radius);
  const at = (p: Pt) => `${f(px(p.x))} ${f(py(p.y))}`;
  const arc = (to: Pt) => `A ${r} ${r} 0 0 1 ${at(to)}`;
  const contourPath = `M ${at(V.endomorph)} ${arc(V.mesomorph)} ${arc(V.ectomorph)} ${arc(V.endomorph)} Z`;

  const M = SOMATOCHART_ARC_MIDPOINTS;
  const axes = (
    [
      [V.endomorph, M.oppositeEndomorph],
      [V.mesomorph, M.oppositeMesomorph],
      [V.ectomorph, M.oppositeEctomorph],
    ] as const
  ).map(([a, b]) => ({ x1: px(a.x), y1: py(a.y), x2: px(b.x), y2: py(b.y) }));

  const gridX: SomatochartLayout["gridX"] = [];
  for (let t = xmin; t <= xmax; t += 2) gridX.push({ x: px(t), label: intLabel(t) });
  const gridY: SomatochartLayout["gridY"] = [];
  for (let t = ymin; t <= ymax; t += 2) gridY.push({ y: py(t), label: intLabel(t) });

  const vertexLabels: SomatochartLayout["vertexLabels"] = [
    { text: "Mesomorfia", x: px(V.mesomorph.x), y: py(V.mesomorph.y) - 4, anchor: "middle" },
    // Debajo de cada vértice, lo bastante abajo para no tocar el arco inferior (ajustado en el render).
    { text: "Endomorfia", x: px(V.endomorph.x), y: py(V.endomorph.y) + 20, anchor: "middle" },
    { text: "Ectomorfia", x: px(V.ectomorph.x), y: py(V.ectomorph.y) + 20, anchor: "middle" },
  ];

  const toPoint = (p: Pt | null) => (p === null ? null : { cx: px(p.x), cy: py(p.y) });
  return {
    width: opts.width,
    height,
    radius,
    contourPath,
    axes,
    gridX,
    gridY,
    plot: { left: px(xmin), top: py(ymax), right: px(xmax), bottom: py(ymin) },
    vertexLabels,
    points: { current: toPoint(opts.current), previous: toPoint(opts.previous) },
  };
}

// ── Silueta esquemática (D5) ───────────────────────────────────────────────

export type BodyZone = "upper" | "central" | "lower";

export const REPORT_BODY_FIGURE: {
  viewBox: { width: 100; height: 220 };
  head: { cx: number; cy: number; r: number };
  /** Cada parte se pinta con el color de su zona adiposa. */
  parts: ReadonlyArray<{ key: string; zone: BodyZone; x: number; y: number; width: number; height: number; rx: number }>;
  /** y del rótulo de cada zona adiposa (a la izquierda de la figura). */
  adiposeLabelY: Record<BodyZone, number>;
  /** y del rótulo de cada región muscular (a la derecha) y el punto de la figura al que apunta. */
  muscleLabels: Record<"arm" | "thigh" | "calf", { y: number; targetX: number; targetY: number }>;
} = {
  viewBox: { width: 100, height: 220 },
  head: { cx: 50, cy: 16, r: 12 },
  parts: [
    { key: "armL", zone: "upper", x: 16, y: 34, width: 12, height: 74, rx: 6 },
    { key: "armR", zone: "upper", x: 72, y: 34, width: 12, height: 74, rx: 6 },
    { key: "chest", zone: "upper", x: 30, y: 32, width: 40, height: 36, rx: 8 },
    { key: "abdomen", zone: "central", x: 30, y: 68, width: 40, height: 42, rx: 6 },
    { key: "legL", zone: "lower", x: 32, y: 112, width: 16, height: 100, rx: 7 },
    { key: "legR", zone: "lower", x: 52, y: 112, width: 16, height: 100, rx: 7 },
  ],
  adiposeLabelY: { upper: 50, central: 89, lower: 160 },
  muscleLabels: {
    arm: { y: 60, targetX: 84, targetY: 60 },
    thigh: { y: 135, targetX: 68, targetY: 135 },
    calf: { y: 190, targetX: 68, targetY: 190 },
  },
};

// ── Barras apiladas de composición al 100 % (D4) ───────────────────────────

export interface CompositionBarsLayout {
  width: number;
  height: number;
  rows: Array<{
    series: "previous" | "current";
    label: string;
    labelY: number;
    /** null → la fila dice "Sin dato" en noDataX/noDataY. */
    segments: Array<{
      key: IsakTissueKey;
      x: number;
      y: number;
      width: number;
      height: number;
      label: string | null;
      labelX: number;
      labelY: number;
    }> | null;
    noDataX: number;
    noDataY: number;
  }>;
}

export const COMPOSITION_BARS = { labelWidth: 110, barHeight: 16, rowGap: 8, minLabelWidth: 30 } as const;

const TISSUE_ORDER: readonly IsakTissueKey[] = ["adipose", "muscle", "bone", "residual"];

export function buildCompositionBarsLayout(
  bars: { previous: CompositionShares | null; current: CompositionShares | null },
  opts: { width: number; hasPrevious: boolean; previousLabel: string | null; currentLabel: string },
): CompositionBarsLayout {
  const C = COMPOSITION_BARS;
  const usable = opts.width - C.labelWidth;
  const series: Array<{ series: "previous" | "current"; label: string; shares: CompositionShares | null }> = [];
  if (opts.hasPrevious) series.push({ series: "previous", label: opts.previousLabel ?? "", shares: bars.previous });
  series.push({ series: "current", label: opts.currentLabel, shares: bars.current });

  const rows: CompositionBarsLayout["rows"] = series.map((row, i) => {
    const y = i * (C.barHeight + C.rowGap);
    const textY = y + C.barHeight / 2 + 2.5;
    let segments: NonNullable<CompositionBarsLayout["rows"][number]["segments"]> | null = null;
    if (row.shares) {
      const shares = row.shares;
      const total = TISSUE_ORDER.reduce((acc, k) => acc + shares[k], 0);
      let x = C.labelWidth;
      segments = TISSUE_ORDER.map((key) => {
        const w = total > 0 ? (shares[key] / total) * usable : 0;
        const seg = {
          key,
          x,
          y,
          width: w,
          height: C.barHeight,
          label: w >= C.minLabelWidth ? `${formatFixedEs(shares[key], 2)} %` : null,
          labelX: x + w / 2,
          labelY: textY,
        };
        x += w;
        return seg;
      });
    }
    return { series: row.series, label: row.label, labelY: textY, segments, noDataX: C.labelWidth + 4, noDataY: textY };
  });
  const height = rows.length * C.barHeight + (rows.length - 1) * C.rowGap;
  return { width: opts.width, height, rows };
}
