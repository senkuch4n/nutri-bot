// HU-017c-4 (SDD 4.2, R-5): `palette` es opcional y sin ella el PDF del plan no cambia.
import { describe, expect, it } from "vitest";
import { PdfFooter, PdfHeader, PdfSignatureBlock, buildCommonStyles } from "./pdf-common";
import { pdfColors } from "./pdf-theme";
import { reportPdfColors } from "./report-pdf-theme";

describe("buildCommonStyles", () => {
  it("sin palette es idéntico a pasar pdfColors (lo que usa el plan)", () => {
    expect(buildCommonStyles("#123456")).toEqual(buildCommonStyles("#123456", pdfColors));
  });

  it("sin palette conserva los colores de hoy", () => {
    const s = buildCommonStyles("#123456");
    expect(s.page.color).toBe(pdfColors.text);
    expect(s.subtitle.color).toBe(pdfColors.muted);
    expect(s.footer.borderTopColor).toBe(pdfColors.border);
    expect(s.accentRule.backgroundColor).toBe("#123456");
  });

  it("con la paleta del informe usa sus grises", () => {
    const s = buildCommonStyles("#123456", reportPdfColors);
    expect(s.page.color).toBe(reportPdfColors.text);
    expect(s.subtitle.color).toBe(reportPdfColors.muted);
    expect(s.brandProduct.color).toBe(reportPdfColors.muted);
    expect(s.footer.color).toBe(reportPdfColors.muted);
    expect(s.footer.borderTopColor).toBe(reportPdfColors.border);
  });
});

describe("palette opcional en encabezado, pie y firma", () => {
  const styles = buildCommonStyles("#123456");
  const signature = { image: null, nameLine: "Lic. Prueba", licenseLine: null };

  it("PdfFooter sin palette usa el estilo tal cual; con palette lo repinta", () => {
    const plain = PdfFooter({ text: "x", pageLabel: () => "1", styles, pageWidth: 90 });
    expect(plain.props.style).toBe(styles.footer);
    const painted = PdfFooter({ text: "x", pageLabel: () => "1", styles, pageWidth: 90, palette: reportPdfColors });
    expect(painted.props.style).toEqual([styles.footer, { borderTopColor: reportPdfColors.border, color: reportPdfColors.muted }]);
  });

  it("PdfHeader renderiza con y sin palette", () => {
    const props = { logoSrc: null, title: "T", subtitle: "S", brandName: "B", styles };
    expect(PdfHeader(props)).toBeTruthy();
    expect(PdfHeader({ ...props, palette: reportPdfColors })).toBeTruthy();
  });

  it("PdfSignatureBlock: la línea usa pdfColors.text por defecto y la paleta si viene", () => {
    type El = { props: { style?: { borderTopColor?: string }; children?: unknown } };
    const rule = (el: El) =>
      (el.props.children as El[]).flat().find((c) => c && (c as El).props?.style?.borderTopColor) as El;
    expect(rule(PdfSignatureBlock({ signature }) as El).props.style?.borderTopColor).toBe(pdfColors.text);
    expect(rule(PdfSignatureBlock({ signature, palette: reportPdfColors }) as El).props.style?.borderTopColor).toBe(
      reportPdfColors.text,
    );
  });
});
