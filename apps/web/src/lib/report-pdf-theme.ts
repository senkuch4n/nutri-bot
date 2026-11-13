// Tema del PDF del informe antropométrico (HU-017c-4, D15): grises fríos y la escala Inter del
// rediseño, adaptada a puntos. El PDF del plan sigue con `pdf-theme.ts` (no cambia hasta 017e).
// Sin "server-only": lo importan el PDF del informe y su test.

/** Acento del informe si la profesional no eligió color (D15). */
export const REPORT_DEFAULT_ACCENT = "#1D1D1F";

export const reportPdfColors = { text: "#1D1D1F", muted: "#636366", border: "#E5E5EA", subtle: "#F5F5F7" } as const;

/** Un estilo de texto de react-pdf (pt). */
export type ReportPdfTextStyle = {
  fontSize: number;
  fontWeight: 400 | 500 | 600;
  lineHeight: number;
  letterSpacing: number;
};

/**
 * Escala en pt (madre §5.3 adaptada; sin opsz: los .woff de public/fonts no lo traen, Q14).
 * El tracking sigue la regla de Apple: negativo en lo grande, levemente positivo en lo chico.
 */
export const reportPdfType: {
  title: ReportPdfTextStyle;
  heading: ReportPdfTextStyle;
  body: ReportPdfTextStyle;
  caption: ReportPdfTextStyle;
  metric: ReportPdfTextStyle;
} = {
  title: { fontSize: 20, fontWeight: 600, lineHeight: 1.15, letterSpacing: -0.3 },
  heading: { fontSize: 13, fontWeight: 600, lineHeight: 1.2, letterSpacing: -0.1 },
  body: { fontSize: 10, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0 },
  caption: { fontSize: 8.5, fontWeight: 400, lineHeight: 1.25, letterSpacing: 0.1 },
  metric: { fontSize: 16, fontWeight: 600, lineHeight: 1.1, letterSpacing: -0.2 },
};

/**
 * Tejidos de la barra de composición. Las luminancias relativas quedan en el mismo orden y con la
 * misma separación que las de HU-007 (adiposo claro, muscular muy oscuro, óseo medio, residual
 * oscuro), así se siguen distinguiendo impresos en gris; los tonos pasan a fríos.
 */
export const reportPdfTissueColors = { adipose: "#9ED3E8", muscle: "#24506B", bone: "#A1A1A6", residual: "#6E67AC" } as const;
/** Texto dentro de cada segmento (contraste ≥ 4,5 contra su fondo). */
export const reportPdfTissueTextColors = {
  adipose: reportPdfColors.text,
  muscle: "#FFFFFF",
  bone: reportPdfColors.text,
  residual: "#FFFFFF",
} as const;
/** Serie "Anterior" (barras y punto de la somatocarta). La serie "Actual" usa el acento. */
export const reportPdfPreviousColor = "#AEAEB2";
/** Zonas adiposas de la silueta (claro → oscuro). */
export const reportPdfZoneColors = { upper: "#DCEFF6", central: "#99CFE3", lower: "#64AECB" } as const;
/** Cabeza de la silueta (sin dato, neutra). */
export const reportPdfFigureNeutral = reportPdfColors.border;
export const reportPdfGridColor = reportPdfColors.border;
