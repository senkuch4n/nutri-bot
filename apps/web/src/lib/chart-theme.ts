// Colores de los gráficos (HU-017a §12.2). Los valores viven en design-tokens.ts (`chartPalette`); acá
// se exponen con los nombres de siempre. Van en hex porque se usan como atributo SVG (fill de las
// barras) y como variable CSS de ChartStyle. Todos ≥ 3:1 sobre blanco (AA para elementos no textuales).
import { chartPalette } from "./design-tokens";

// tint · verde · naranja · violeta · rojo
export const chartSeriesColors = chartPalette.series;

/** Serie principal: el tint. */
export const chartDefaultColor: string = chartPalette.series[0];

/**
 * Estudios comparados, de más viejo a más nuevo. Grises de más claro a más oscuro para los
 * anteriores; el último estudio siempre va en `chartDefaultColor`.
 */
export const chartStudyColors = chartPalette.study;

/** Color del estudio `index` (0 = más viejo) entre `total` estudios. El último es el tint. */
export function studyColor(index: number, total: number): string {
  if (index === total - 1) return chartDefaultColor;
  const offset = chartStudyColors.length - (total - 1) + index;
  return chartStudyColors[Math.max(0, Math.min(offset, chartStudyColors.length - 1))] ?? chartDefaultColor;
}

/** Un color fijo por métrica, así el peso es siempre tint y la grasa siempre naranja. */
export const chartMetricColors = chartPalette.metric;

/** Tejidos del estudio ISAK (HU-006). */
export const isakTissueColors = chartPalette.tissue;
