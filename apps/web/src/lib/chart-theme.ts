// Único lugar donde viven los colores de serie. Van en hex porque se usan como atributo SVG
// (fill de las barras) y como variable CSS de ChartStyle. Todos ≥ 3:1 sobre blanco (AA para
// elementos no textuales).
// info · success · ámbar · violeta · destructive
export const chartSeriesColors = ["#2C6890", "#396F51", "#B37D19", "#7959A6", "#B53A36"] as const;

export const chartDefaultColor = "#2C6890";

/**
 * Estudios comparados, de más viejo a más nuevo. Grises de más claro a más oscuro para los
 * anteriores; el último estudio siempre va en `chartDefaultColor`.
 * Contrastes sobre blanco: 3,41 / 5,98 / 12,25 : 1.
 */
export const chartStudyColors = ["#8C8B87", "#65635D", "#37352F"] as const;

/** Color del estudio `index` (0 = más viejo) entre `total` estudios. El último es el azul. */
export function studyColor(index: number, total: number): string {
  if (index === total - 1) return chartDefaultColor;
  const offset = chartStudyColors.length - (total - 1) + index;
  return chartStudyColors[Math.max(0, Math.min(offset, chartStudyColors.length - 1))] ?? chartDefaultColor;
}

/** Un color fijo por métrica, así el peso es siempre azul y la grasa siempre ámbar. */
export const chartMetricColors = {
  weightKg: "#2C6890",
  bodyFatPercent: "#B37D19",
  muscleMassKg: "#396F51",
  bodyWaterPercent: "#7959A6",
  visceralFatLevel: "#B53A36",
  boneMassKg: "#65635D",
  basalMetabolicRateKcal: "#37352F",
} as const;

/** Tejidos del estudio ISAK (HU-006). Hex ya existentes en este archivo: sin colores nuevos. */
export const isakTissueColors = {
  adipose: "#B37D19", // ámbar (chartSeriesColors[2])
  muscle: "#396F51", // verde (chartSeriesColors[1])
  bone: "#65635D", // gris (chartStudyColors[1])
  residual: "#7959A6", // violeta (chartSeriesColors[3])
} as const;
