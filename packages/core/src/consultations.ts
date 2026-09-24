import { addDays } from "date-fns";
import { wallTimeToUtc, dayKeyInTz } from "./time";

/**
 * Consulta como entidad central (HU-003). Lógica pura: agrupación de mediciones,
 * reglas de "vacía" / "borrable", fechas por día local y elección de consulta del día.
 */

export const ANTHROPOMETRY_MEASURE_KEYS = [
  "heightCm",
  "waistCm",
  "hipCm",
  "armCm",
  "thighCm",
  "calfCm",
  "tricepsSkinfoldMm",
  "subscapularSkinfoldMm",
  "abdominalSkinfoldMm",
] as const;
export const BIOIMPEDANCE_MEASURE_KEYS = [
  "bodyFatPercent",
  "muscleMassKg",
  "bodyWaterPercent",
  "visceralFatLevel",
  "boneMassKg",
  "basalMetabolicRateKcal",
] as const;
export type AnthropometryMeasureKey = (typeof ANTHROPOMETRY_MEASURE_KEYS)[number];
export type BioimpedanceMeasureKey = (typeof BIOIMPEDANCE_MEASURE_KEYS)[number];
export type MeasurementValues = { weightKg: number | null } & Record<
  AnthropometryMeasureKey | BioimpedanceMeasureKey,
  number | null
>;

/**
 * A qué grupo(s) del detalle pertenece una medición.
 * bioimpedance = algún campo de BIOIMPEDANCE_MEASURE_KEYS no nulo.
 * anthropometry = algún campo de ANTHROPOMETRY_MEASURE_KEYS no nulo, o si no es de bioimpedancia
 *   (una medición con solo peso y/o nota va a Antropometría). Toda medición cae en al menos un grupo.
 * El peso se muestra en Antropometría si la medición está ahí; si no, en Bioimpedancia.
 */
export function measurementKinds(m: MeasurementValues): { anthropometry: boolean; bioimpedance: boolean } {
  const bioimpedance = BIOIMPEDANCE_MEASURE_KEYS.some((k) => m[k] != null);
  const hasAnthropometry = ANTHROPOMETRY_MEASURE_KEYS.some((k) => m[k] != null);
  return { anthropometry: hasAnthropometry || !bioimpedance, bioimpedance };
}

export type ConsultationChip = "Antropometría" | "Bioimpedancia" | "Plan" | "Notas";

function hasText(notes: string | null): boolean {
  return notes != null && notes.trim().length > 0;
}

/** Chips en ese orden fijo, solo los que aplican. `notes` con solo espacios no cuenta. */
export function consultationChips(input: {
  measurements: MeasurementValues[];
  hasPlan: boolean;
  notes: string | null;
}): ConsultationChip[] {
  let anthropometry = false;
  let bioimpedance = false;
  for (const m of input.measurements) {
    const kinds = measurementKinds(m);
    anthropometry ||= kinds.anthropometry;
    bioimpedance ||= kinds.bioimpedance;
  }
  const chips: ConsultationChip[] = [];
  if (anthropometry) chips.push("Antropometría");
  if (bioimpedance) chips.push("Bioimpedancia");
  if (input.hasPlan) chips.push("Plan");
  if (hasText(input.notes)) chips.push("Notas");
  return chips;
}

/** Vacía (D3, al revertir un turno): sin mediciones, sin plan y sin notas (trim). */
export function isConsultationEmpty(input: {
  measurementCount: number;
  hasPlan: boolean;
  notes: string | null;
}): boolean {
  return input.measurementCount === 0 && !input.hasPlan && !hasText(input.notes);
}

/** Borrable a mano: sin mediciones y sin plan. Las notas se borran con ella, previa confirmación. */
export function canDeleteConsultation(input: { measurementCount: number; hasPlan: boolean }): boolean {
  return input.measurementCount === 0 && !input.hasPlan;
}

export const CONSULTATION_NOTES_MAX = 4000;

/** Textos que comparten web y domain. Exactos, sin punto final salvo donde está. */
export const CONSULTATION_TEXT = {
  futureDate: "La fecha de la consulta no puede ser futura",
  futureMeasurementDate: "La fecha de la medición no puede ser futura",
  notDeletable: "Para eliminar la consulta primero borrá sus mediciones y quitá el plan indicado",
  sameDayExists: "Ya hay una consulta de ese día",
  appointmentNotCompleted: "El turno de esta consulta ya no figura como completado.",
} as const;

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "yyyy-MM-dd" válido de calendario (rechaza "2026-02-30"). */
export function isValidDayKey(dayKey: string): boolean {
  const match = DAY_KEY_RE.exec(dayKey);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** true si dayKey > hoy en `tz` (compara con dayKeyInTz(now, tz)). */
export function isFutureDayKey(dayKey: string, now: Date, tz: string): boolean {
  // "yyyy-MM-dd" se ordena lexicográficamente igual que cronológicamente.
  return dayKey > dayKeyInTz(now, tz);
}

/** Instante UTC del día a las 12:00 en `tz` = wallTimeToUtc(dayKey, "12:00", tz). Misma convención que las mediciones de hoy. */
export function dayKeyToNoonUtc(dayKey: string, tz: string): Date {
  return wallTimeToUtc(dayKey, "12:00", tz);
}

/** Día calendario siguiente a `dayKey`, sin depender de la zona del proceso. */
function nextDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const next = addDays(new Date(Date.UTC(y!, m! - 1, d!, 12)), 1);
  return next.toISOString().slice(0, 10);
}

/** [inicio del día, inicio del día siguiente) en `tz`, como instantes UTC. */
export function dayRangeUtc(dayKey: string, tz: string): { start: Date; end: Date } {
  return {
    start: wallTimeToUtc(dayKey, "00:00", tz),
    end: wallTimeToUtc(nextDayKey(dayKey), "00:00", tz),
  };
}

/**
 * D5: entre varias consultas del mismo día, la vinculada a un turno (si hay varias, la de
 * `consultedAt` más reciente); si ninguna tiene turno, la de `createdAt` más reciente. [] → null.
 */
export function pickConsultationForDay<
  T extends { appointmentId: string | null; consultedAt: Date; createdAt: Date },
>(candidates: readonly T[]): T | null {
  let best: T | null = null;
  for (const c of candidates) {
    if (best == null) {
      best = c;
      continue;
    }
    const cHas = c.appointmentId != null;
    const bestHas = best.appointmentId != null;
    if (cHas !== bestHas) {
      if (cHas) best = c;
      continue;
    }
    if (cHas) {
      if (c.consultedAt.getTime() > best.consultedAt.getTime()) best = c;
    } else if (c.createdAt.getTime() > best.createdAt.getTime()) {
      best = c;
    }
  }
  return best;
}
