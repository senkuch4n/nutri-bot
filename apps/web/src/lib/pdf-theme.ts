// Colores del PDF del plan. Sin "server-only": /ajustes (002c) lo importa para el valor inicial
// del selector de color. El acento elegido por la profesional viene del dato, no de acá.

/** Acento por defecto cuando no hay color elegido en /ajustes (D2: neutro). */
export const DEFAULT_PDF_ACCENT = "#37352F";

export const pdfColors = {
  text: "#37352F",
  muted: "#65635D",
  border: "#E9E9E7",
  subtle: "#F6F6F4",
} as const;

/** Informe antropométrico (HU-007). Luminancias distintas: se distinguen impresos en gris. */
export const reportTissueColors = { adipose: "#EBC77A", muscle: "#2F5D43", bone: "#A3A19B", residual: "#7C69A8" } as const;
/** Texto dentro de cada segmento (contraste). */
export const reportTissueTextColors = { adipose: "#37352F", muscle: "#FFFFFF", bone: "#37352F", residual: "#FFFFFF" } as const;
/** Serie "Anterior" (barras y punto de la somatocarta). La serie "Actual" usa el acento de /ajustes. */
export const reportPreviousColor = "#B8B6B0";
/** Zonas adiposas de la silueta (claro → oscuro). */
export const reportZoneColors = { upper: "#F1E3C2", central: "#E3C27F", lower: "#C9A55A" } as const;
export const reportGridColor = pdfColors.border;
