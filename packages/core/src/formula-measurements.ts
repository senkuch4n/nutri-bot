/**
 * HU-004 (D4): qué medición usa cada dato de las fórmulas en una consulta. Para cada dato, el de
 * la propia consulta; si no tiene, el último anterior (o del mismo día) del paciente. Cada dato se
 * elige por separado: el peso puede salir de una medición y la talla de otra.
 */

export const FORMULA_MEASURE_KEYS = [
  "weightKg",
  "heightCm",
  "waistCm",
  "hipCm",
  "bodyFatPercent",
  "basalMetabolicRateKcal",
] as const;
export type FormulaMeasureKey = (typeof FORMULA_MEASURE_KEYS)[number];

export type FormulaMeasurementEntry = {
  consultationId: string | null;
  recordedAt: Date;
  createdAt: Date;
} & Record<FormulaMeasureKey, number | null>;

export interface SourcedMeasurement {
  value: number;
  recordedAt: Date;
  consultationId: string | null;
}
export type FormulaMeasurements = Record<FormulaMeasureKey, SourcedMeasurement | null>;

function byCreatedAtDesc(a: FormulaMeasurementEntry, b: FormulaMeasurementEntry): number {
  return b.createdAt.getTime() - a.createdAt.getTime();
}

function byRecordedAtThenCreatedAtDesc(a: FormulaMeasurementEntry, b: FormulaMeasurementEntry): number {
  const diff = b.recordedAt.getTime() - a.recordedAt.getTime();
  return diff !== 0 ? diff : byCreatedAtDesc(a, b);
}

/**
 * Para cada clave, el primer valor no nulo en este orden:
 *   1) entradas con consultationId === `consultationId` (si no es null), por createdAt desc;
 *   2) el resto, por recordedAt desc y después createdAt desc.
 * No filtra por fecha: quien llama ya pasó solo las entradas con recordedAt < tope.
 */
export function pickFormulaMeasurements(
  entries: readonly FormulaMeasurementEntry[],
  consultationId: string | null,
): FormulaMeasurements {
  const own =
    consultationId === null
      ? []
      : entries.filter((e) => e.consultationId === consultationId).sort(byCreatedAtDesc);
  const others = entries
    .filter((e) => consultationId === null || e.consultationId !== consultationId)
    .sort(byRecordedAtThenCreatedAtDesc);
  const ordered = [...own, ...others];

  const result = {} as FormulaMeasurements;
  for (const key of FORMULA_MEASURE_KEYS) {
    const entry = ordered.find((e) => e[key] != null);
    result[key] =
      entry === undefined
        ? null
        : { value: entry[key] as number, recordedAt: entry.recordedAt, consultationId: entry.consultationId };
  }
  return result;
}
