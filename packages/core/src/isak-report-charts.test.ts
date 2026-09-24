import { describe, expect, it } from "vitest";
import { CASE_A, CASE_B } from "./isak-fixtures.test-data";
import { SOMATOCHART_VERTICES } from "./isak";
import { buildIsakReportModel, type IsakReportBar } from "./isak-report";
import {
  COMPOSITION_BARS,
  GIRTH_BARS,
  REPORT_BODY_FIGURE,
  SOMATOCHART_ARC_MIDPOINTS,
  buildCompositionBarsLayout,
  buildGirthBarsLayout,
  buildSomatochartLayout,
} from "./isak-report-charts";
import { buildIsakStudy } from "./isak-study";

const model = buildIsakReportModel({
  patientName: "Paciente de prueba",
  current: { result: buildIsakStudy({ measures: CASE_A, sex: "MALE", ageYears: 22 }), dateLabel: "08/05/2026", ageYears: 22 },
  previous: { result: buildIsakStudy({ measures: CASE_B, sex: "MALE", ageYears: 21 }), dateLabel: "05/11/2025", ageYears: 21 },
});

describe("buildGirthBarsLayout", () => {
  const layout = buildGirthBarsLayout(model.distribution.bars, { width: 300, hasPrevious: true });

  it("eje y grupos", () => {
    expect(layout.axisMax).toBe(60);
    expect(layout.ticks.map((t) => t.label)).toEqual(["0", "10", "20", "30", "40", "50", "60"]);
    expect(layout.ticks[0]!.x).toBe(96);
    expect(layout.ticks[6]!.x).toBeCloseTo(300 - 32, 6);
    expect(layout.groups).toHaveLength(6);
    for (const g of layout.groups) {
      expect(g.bars.map((b) => b.series)).toEqual(["previous", "current"]);
      expect(g.labelX).toBe(GIRTH_BARS.labelWidth - 6);
    }
    expect(layout.height).toBeGreaterThan(layout.axisY);
    // Las barras no se superponen y quedan arriba del eje.
    const ys = layout.groups.flatMap((g) => g.bars.map((b) => [b.y, b.y + b.height] as const));
    for (let i = 1; i < ys.length; i++) expect(ys[i]![0]).toBeGreaterThan(ys[i - 1]![1]);
    expect(ys[ys.length - 1]![1]).toBeLessThan(layout.axisY);
  });

  it("barra actual del muslo medio", () => {
    const thigh = layout.groups.find((g) => g.key === "thigh")!;
    const cur = thigh.bars.find((b) => b.series === "current")!;
    expect(cur.x).toBe(96);
    // plotWidth = 300 − 96 − 32 = 172 (la SDD dice 174 por un error de cuenta).
    expect(cur.width).toBeCloseTo((52 / 60) * 172, 2);
    expect(cur.valueLabel).toBe("52,0");
    expect(cur.valueX).toBeCloseTo(96 + (52 / 60) * 172 + 3, 6);
    const corrected = layout.groups.find((g) => g.key === "correctedThigh")!;
    expect(corrected.bars[1]!.valueLabel).toBe("48,54");
  });

  it("sin anterior y con un valor faltante", () => {
    const bars: IsakReportBar[] = model.distribution.bars.map((b, i) => ({ ...b, previous: null, current: i === 0 ? null : b.current }));
    const l = buildGirthBarsLayout(bars, { width: 300, hasPrevious: false });
    for (const g of l.groups) expect(g.bars).toHaveLength(1);
    expect(l.groups[0]!.bars[0]).toMatchObject({ width: 0, valueLabel: "Sin dato", valueX: 99 });
  });

  it("eje mínimo de 10", () => {
    const bars: IsakReportBar[] = [{ key: "arm", label: "Brazo relajado", previous: null, current: 4, decimals: 1 }];
    expect(buildGirthBarsLayout(bars, { width: 300, hasPrevious: false }).axisMax).toBe(10);
  });
});

describe("somatocarta", () => {
  it("puntos medios de los arcos", () => {
    const M = SOMATOCHART_ARC_MIDPOINTS;
    expect(M.oppositeEndomorph.x).toBeCloseTo(4.392, 3);
    expect(M.oppositeEndomorph.y).toBeCloseTo(4.392, 3);
    expect(M.oppositeMesomorph.x).toBeCloseTo(0, 3);
    expect(M.oppositeMesomorph.y).toBeCloseTo(-8.785, 3);
    expect(M.oppositeEctomorph.x).toBeCloseTo(-4.392, 3);
    expect(M.oppositeEctomorph.y).toBeCloseTo(4.392, 3);
  });

  const current = { x: -2.12, y: 5.43 };
  const previous = { x: -3.94, y: 5.48 };
  const layout = buildSomatochartLayout({ width: 240, current, previous });
  const s = 216 / 16;
  const px = (x: number) => 18 + (x + 8) * s;
  const py = (y: number) => 14 + ((16 - y) * s) / Math.sqrt(3);

  it("escala, radio y contorno", () => {
    expect(layout.radius).toBeCloseTo(12 * 13.5, 9);
    expect(layout.contourPath.startsWith(`M ${px(-6).toFixed(2)} ${py(-6).toFixed(2)} A 162.00 162.00 0 0 1`)).toBe(true);
    expect(layout.contourPath.endsWith("Z")).toBe(true);
    expect(layout.contourPath.match(/A 162\.00 162\.00 0 0 1/g)).toHaveLength(3);
    expect(layout.height).toBeCloseTo(14 + (26 * s) / Math.sqrt(3) + 14, 6);
    expect(layout.plot).toEqual({ left: px(-8), top: py(16), right: px(8), bottom: py(-10) });
  });

  it("los 3 ejes pasan por el origen", () => {
    const ox = px(0);
    const oy = py(0);
    expect(layout.axes).toHaveLength(3);
    for (const a of layout.axes) {
      const cross = (a.x2 - a.x1) * (oy - a.y1) - (a.y2 - a.y1) * (ox - a.x1);
      const len = Math.hypot(a.x2 - a.x1, a.y2 - a.y1);
      expect(Math.abs(cross / len)).toBeLessThan(0.01);
    }
  });

  it("puntos", () => {
    expect(layout.points.current!.cx).toBeCloseTo(px(-2.12), 9);
    expect(layout.points.current!.cy).toBeCloseTo(py(5.43), 9);
    expect(layout.points.previous!.cx).toBeCloseTo(px(-3.94), 9);
    expect(buildSomatochartLayout({ width: 240, current: null, previous: null }).points).toEqual({ current: null, previous: null });
  });

  it("triángulo equilátero en puntos", () => {
    const V = SOMATOCHART_VERTICES;
    const pts = [V.endomorph, V.mesomorph, V.ectomorph].map((v) => ({ x: px(v.x), y: py(v.y) }));
    const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    const [a, b, c] = pts as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
    expect(d(a, b)).toBeCloseTo(layout.radius, 2);
    expect(d(b, c)).toBeCloseTo(layout.radius, 2);
    expect(d(c, a)).toBeCloseTo(layout.radius, 2);
  });

  it("grilla y ampliación del dominio", () => {
    expect(layout.gridX.map((g) => g.label)).toEqual(["−8", "−6", "−4", "−2", "0", "2", "4", "6", "8"]);
    expect(layout.gridY).toHaveLength(14);
    const wide = buildSomatochartLayout({ width: 240, current: { x: 9, y: 0 }, previous: null });
    expect(wide.gridX[wide.gridX.length - 1]!.label).toBe("10");
    expect(wide.gridX[0]!.label).toBe("−8");
  });

  it("rótulos de los vértices", () => {
    expect(layout.vertexLabels.map((l) => l.text)).toEqual(["Mesomorfia", "Endomorfia", "Ectomorfia"]);
  });
});

describe("REPORT_BODY_FIGURE", () => {
  const F = REPORT_BODY_FIGURE;
  it("cada zona tiene al menos una parte y todo queda dentro del viewBox", () => {
    for (const zone of ["upper", "central", "lower"] as const) {
      expect(F.parts.some((p) => p.zone === zone)).toBe(true);
    }
    for (const p of F.parts) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.width).toBeLessThanOrEqual(F.viewBox.width);
      expect(p.y + p.height).toBeLessThanOrEqual(F.viewBox.height);
    }
    expect(F.head.cy - F.head.r).toBeGreaterThanOrEqual(0);
    for (const l of Object.values(F.muscleLabels)) {
      expect(l.targetY).toBeLessThanOrEqual(F.viewBox.height);
      expect(l.targetX).toBeLessThanOrEqual(F.viewBox.width);
    }
  });
});

describe("buildCompositionBarsLayout", () => {
  const bars = model.composition!.bars;
  const layout = buildCompositionBarsLayout(bars, {
    width: 500,
    hasPrevious: true,
    previousLabel: "Anterior (05/11/2025)",
    currentLabel: "Actual (08/05/2026)",
  });

  it("2 filas con 4 segmentos que suman el ancho útil", () => {
    expect(layout.rows.map((r) => r.series)).toEqual(["previous", "current"]);
    expect(layout.rows[0]!.label).toBe("Anterior (05/11/2025)");
    for (const r of layout.rows) {
      expect(r.segments!.map((s) => s.key)).toEqual(["adipose", "muscle", "bone", "residual"]);
      const total = r.segments!.reduce((acc, s) => acc + s.width, 0);
      expect(total).toBeCloseTo(500 - COMPOSITION_BARS.labelWidth, 2);
      expect(r.segments![0]!.x).toBe(110);
    }
    expect(layout.rows[1]!.segments![0]!.label).toBe("27,02 %");
    expect(layout.height).toBe(2 * 16 + 8);
  });

  it("segmento angosto sin rótulo", () => {
    const l = buildCompositionBarsLayout(
      { previous: null, current: { adipose: 50, muscle: 45, bone: 4, residual: 1 } },
      { width: 500, hasPrevious: false, previousLabel: null, currentLabel: "Actual (08/05/2026)" },
    );
    expect(l.rows).toHaveLength(1);
    const residual = l.rows[0]!.segments!.find((s) => s.key === "residual")!;
    expect(residual.width).toBeLessThan(30);
    expect(residual.label).toBeNull();
  });

  it("anterior sin datos", () => {
    const l = buildCompositionBarsLayout(
      { previous: null, current: bars.current },
      { width: 500, hasPrevious: true, previousLabel: "Anterior (05/11/2025)", currentLabel: "Actual (08/05/2026)" },
    );
    expect(l.rows[0]!.segments).toBeNull();
    expect(l.rows[1]!.segments).not.toBeNull();
  });
});
