// HU-017c-4 (SDD 9-4): la paleta del informe se lee y se distingue impresa en gris.
import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance } from "./contrast";
import { pdfColors } from "./pdf-theme";
import {
  REPORT_DEFAULT_ACCENT,
  reportPdfColors,
  reportPdfPreviousColor,
  reportPdfTissueColors,
  reportPdfTissueTextColors,
  reportPdfType,
  reportPdfZoneColors,
} from "./report-pdf-theme";

/** Diferencia mínima de luminancia entre cualquier par de colores. */
function minLuminanceGap(colors: readonly string[]): number {
  const lums = colors.map(relativeLuminance);
  let min = Infinity;
  for (let i = 0; i < lums.length; i++) {
    for (let j = i + 1; j < lums.length; j++) min = Math.min(min, Math.abs(lums[i]! - lums[j]!));
  }
  return min;
}

describe("reportPdfColors", () => {
  it("texto ≥ 7:1 y secundario ≥ 4,5:1 sobre blanco", () => {
    expect(contrastRatio(reportPdfColors.text, "#FFFFFF")).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(reportPdfColors.muted, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    // También sobre el relleno sutil.
    expect(contrastRatio(reportPdfColors.muted, reportPdfColors.subtle)).toBeGreaterThanOrEqual(4.5);
  });

  it("es la paleta fría de la HU §4.5, distinta de la del plan", () => {
    expect(reportPdfColors).toEqual({ text: "#1D1D1F", muted: "#636366", border: "#E5E5EA", subtle: "#F5F5F7" });
    expect(reportPdfColors.text).not.toBe(pdfColors.text);
    expect(REPORT_DEFAULT_ACCENT).toBe("#1D1D1F");
  });
});

describe("tejidos y zonas (impresos en gris)", () => {
  it("las 4 luminancias de tejidos se separan por ≥ 0,08", () => {
    expect(minLuminanceGap(Object.values(reportPdfTissueColors))).toBeGreaterThanOrEqual(0.08);
  });

  it("las 3 zonas de la silueta se separan por ≥ 0,08 y van de claro a oscuro", () => {
    expect(minLuminanceGap(Object.values(reportPdfZoneColors))).toBeGreaterThanOrEqual(0.08);
    const [upper, central, lower] = [reportPdfZoneColors.upper, reportPdfZoneColors.central, reportPdfZoneColors.lower].map(
      relativeLuminance,
    );
    expect(upper).toBeGreaterThan(central!);
    expect(central).toBeGreaterThan(lower!);
  });

  it("el rótulo dentro de cada tejido se lee (≥ 4,5:1)", () => {
    for (const key of Object.keys(reportPdfTissueColors) as (keyof typeof reportPdfTissueColors)[]) {
      expect(contrastRatio(reportPdfTissueTextColors[key], reportPdfTissueColors[key])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("la serie anterior se distingue del acento por defecto", () => {
    expect(Math.abs(relativeLuminance(reportPdfPreviousColor) - relativeLuminance(REPORT_DEFAULT_ACCENT))).toBeGreaterThanOrEqual(
      0.3,
    );
  });
});

describe("reportPdfType", () => {
  it("escala de la SDD 4.1 (pt y peso)", () => {
    const pick = (s: { fontSize: number; fontWeight: number }) => [s.fontSize, s.fontWeight];
    expect(pick(reportPdfType.title)).toEqual([20, 600]);
    expect(pick(reportPdfType.heading)).toEqual([13, 600]);
    expect(pick(reportPdfType.body)).toEqual([10, 400]);
    expect(pick(reportPdfType.caption)).toEqual([8.5, 400]);
    expect(pick(reportPdfType.metric)).toEqual([16, 600]);
  });

  it("tracking negativo en lo grande y no negativo en lo chico", () => {
    expect(reportPdfType.title.letterSpacing).toBeLessThan(0);
    expect(reportPdfType.caption.letterSpacing).toBeGreaterThanOrEqual(0);
  });
});
