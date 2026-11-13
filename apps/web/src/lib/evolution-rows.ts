import type { EvolutionEntry } from "@nutri-bot/db";
import { formatDate, formatInTimeZone } from "@nutri-bot/core";
import type { EvolutionRow } from "@/app/(panel)/pacientes/[id]/evolution-types";

// Server-safe: mapeo EvolutionEntry (Prisma, con Decimal) → EvolutionRow (serializable al cliente).
// Lo usan la ficha del paciente y el detalle de la consulta (HU-003).

const num = (v: { toString(): string } | null): number | null => (v !== null ? Number(v) : null);

/** Si la consulta trajo `anthropometricReport` (ficha, R7 de 017c-4), la fila lleva `hasReport`. */
export function toEvolutionRow(
  e: EvolutionEntry & { anthropometricReport?: { id: string } | null },
  tz: string,
): EvolutionRow {
  return {
    id: e.id,
    consultationId: e.consultationId,
    recordedAtISO: e.recordedAt.toISOString(),
    recordedAtLabel: formatDate(e.recordedAt, tz),
    recordedAtShortLabel: formatInTimeZone(e.recordedAt, tz, "dd/MM/yyyy"),
    weightKg: num(e.weightKg),
    heightCm: num(e.heightCm),
    waistCm: num(e.waistCm),
    hipCm: num(e.hipCm),
    armCm: num(e.armCm),
    thighCm: num(e.thighCm),
    calfCm: num(e.calfCm),
    tricepsSkinfoldMm: num(e.tricepsSkinfoldMm),
    subscapularSkinfoldMm: num(e.subscapularSkinfoldMm),
    abdominalSkinfoldMm: num(e.abdominalSkinfoldMm),
    sittingHeightCm: num(e.sittingHeightCm),
    armSpanCm: num(e.armSpanCm),
    bicepsSkinfoldMm: num(e.bicepsSkinfoldMm),
    iliacCrestSkinfoldMm: num(e.iliacCrestSkinfoldMm),
    supraspinaleSkinfoldMm: num(e.supraspinaleSkinfoldMm),
    thighSkinfoldMm: num(e.thighSkinfoldMm),
    calfSkinfoldMm: num(e.calfSkinfoldMm),
    armFlexedCm: num(e.armFlexedCm),
    humerusBreadthCm: num(e.humerusBreadthCm),
    bistyloidBreadthCm: num(e.bistyloidBreadthCm),
    femurBreadthCm: num(e.femurBreadthCm),
    bodyFatPercent: num(e.bodyFatPercent),
    muscleMassKg: num(e.muscleMassKg),
    bodyWaterPercent: num(e.bodyWaterPercent),
    visceralFatLevel: num(e.visceralFatLevel),
    boneMassKg: num(e.boneMassKg),
    basalMetabolicRateKcal: e.basalMetabolicRateKcal,
    note: e.note,
    study: e.study,
    ...(e.anthropometricReport !== undefined ? { hasReport: e.anthropometricReport !== null } : {}),
  };
}
