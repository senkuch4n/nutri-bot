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
