import type { EvolutionMeasures } from "@nutri-bot/db/domain";

// Parseo de las medidas de un formulario de medición. Sin "use server": lo comparten
// `addEvolutionEntryAction` (Evolución) y `addConsultationMeasurementAction` (detalle de la consulta).

export const MEASURE_FIELDS = [
  "weightKg",
  "heightCm",
  "waistCm",
  "hipCm",
  "armCm",
  "thighCm",
  "calfCm",
  "tricepsSkinfoldMm",
  "subscapularSkinfoldMm",
  "abdominalSkinfoldMm",
  "bodyFatPercent",
  "muscleMassKg",
  "bodyWaterPercent",
  "visceralFatLevel",
  "boneMassKg",
  "basalMetabolicRateKcal",
] as const;

const NOTE_MAX = 2000;

/** Vacío → null; número > 0 (acepta coma decimal) → número; cualquier otra cosa → undefined (inválido). */
export function parseMeasure(raw: string | undefined): number | null | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function parseMeasuresFromForm(
  data: Record<string, string | undefined>,
): { ok: true; measures: EvolutionMeasures } | { ok: false; error: "Alguna medida es inválida" } {
  const measures: EvolutionMeasures = {};
  for (const field of MEASURE_FIELDS) {
    const value = parseMeasure(data[field]);
    if (value === undefined) return { ok: false, error: "Alguna medida es inválida" };
    measures[field] = value;
  }
  const note = data.note?.trim() ?? "";
  if (note.length > NOTE_MAX) return { ok: false, error: "Alguna medida es inválida" };
  measures.note = note || null;
  return { ok: true, measures };
}
