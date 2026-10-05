// Filas del gráfico de evolución (EvolutionChart). Puro, con test: el gráfico necesita `value`
// numérico (un Decimal de Prisma serializado llega como string y Recharts no lo dibuja bien).

export interface EvolutionChartInputPoint {
  date: Date;
  /** Número; se acepta un string numérico ("78.00") por si llega un Decimal serializado. */
  value: number | string;
}

export interface EvolutionChartRow {
  label: string;
  full: string;
  value: number;
  isLast: boolean;
}

const fmtDay = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit" });
const fmtFull = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" });

/** Ordena por fecha (más vieja primero), convierte `value` a número y descarta lo que no es finito. */
export function evolutionChartRows(points: readonly EvolutionChartInputPoint[]): EvolutionChartRow[] {
  const valid = points
    .map((p) => ({ date: p.date, value: typeof p.value === "number" ? p.value : Number(p.value) }))
    .filter((p) => Number.isFinite(p.value) && !Number.isNaN(p.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return valid.map((p, i) => ({
    label: fmtDay.format(p.date),
    full: fmtFull.format(p.date),
    value: p.value,
    isLast: i === valid.length - 1,
  }));
}
