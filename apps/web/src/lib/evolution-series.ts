// Helpers de forma de datos para los gráficos de evolución: filtran, ordenan y restan dos
// números. No son reglas de dominio (esas van a packages/core).

export type SeriesPoint = { date: Date; value: number };

/** Puntos con valor de `pick`, ordenados por fecha ascendente (sin nulls). */
export function seriesPoints<T extends { recordedAtISO: string }>(
  entries: readonly T[],
  pick: (e: T) => number | null,
): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (const entry of entries) {
    const value = pick(entry);
    if (value !== null) points.push({ date: new Date(entry.recordedAtISO), value });
  }
  return points.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Último punto y su diferencia con el anterior (null si hay uno solo). null si no hay puntos. */
export function latestWithDelta(
  points: readonly SeriesPoint[],
): { value: number; date: Date; delta: number | null } | null {
  const last = points[points.length - 1];
  if (!last) return null;
  const previous = points[points.length - 2];
  return { value: last.value, date: last.date, delta: previous ? last.value - previous.value : null };
}

/** Las últimas `max` entradas con al menos un valor no-null en `fields`, en orden ascendente. */
export function lastStudies<T extends { recordedAtISO: string }>(
  entries: readonly T[],
  fields: readonly (keyof T)[],
  max = 4,
): T[] {
  return entries
    .filter((e) => fields.some((f) => e[f] !== null && e[f] !== undefined))
    .sort((a, b) => new Date(a.recordedAtISO).getTime() - new Date(b.recordedAtISO).getTime())
    .slice(-max);
}

/** "+0,8 kg" · "−1,2 kg" (U+2212) · "Sin cambios". es-AR. */
export function formatDelta(delta: number, unit: string, decimals = 1): string {
  const formatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: decimals });
  const magnitude = formatter.format(Math.abs(delta));
  // Si con `decimals` la diferencia redondea a 0 ("0" o "0,0"), no hay cambio que mostrar.
  if (/^0(,0+)?$/.test(magnitude)) return "Sin cambios";
  const sign = delta > 0 ? "+" : "−";
  const suffix = unit ? ` ${unit}` : "";
  return `${sign}${magnitude}${suffix}`;
}
