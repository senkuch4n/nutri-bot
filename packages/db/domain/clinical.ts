import {
  CONSULTATION_TEXT,
  dayKeyInTz,
  dayKeyToNoonUtc,
  isFutureDayKey,
  isValidDayKey,
} from "@nutri-bot/core";
import { prisma, type Consultation, type EvolutionEntry } from "../index";
import { getProfessional } from "./availability";
import { FutureConsultationDateError, findOrCreateConsultationForDay } from "./consultations";

export function getClinicalRecord(patientId: string) {
  return prisma.clinicalRecord.findUnique({
    where: { patientId },
  });
}

export function upsertClinicalRecord(
  patientId: string,
  data: { background?: string | null; goals?: string | null; riskFlag?: boolean },
) {
  return prisma.clinicalRecord.upsert({
    where: { patientId },
    update: data,
    create: { patientId, ...data },
  });
}

export function listEvolutionEntries(patientId: string) {
  return prisma.evolutionEntry.findMany({
    where: { patientId },
    orderBy: { recordedAt: "desc" },
  });
}

export type EvolutionMeasures = {
  weightKg?: number | null;
  note?: string | null;
  heightCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  armCm?: number | null;
  thighCm?: number | null;
  calfCm?: number | null;
  tricepsSkinfoldMm?: number | null;
  subscapularSkinfoldMm?: number | null;
  abdominalSkinfoldMm?: number | null;
  bodyFatPercent?: number | null;
  muscleMassKg?: number | null;
  bodyWaterPercent?: number | null;
  visceralFatLevel?: number | null;
  boneMassKg?: number | null;
  basalMetabolicRateKcal?: number | null;
};

/**
 * Alta desde Evolución (D4). `dayKey` "yyyy-MM-dd" en la zona de la profesional. La medición cae
 * en la consulta de ese día o en una "Sin turno" nueva, todo en una transacción.
 */
export async function addEvolutionEntryOnDay(
  patientId: string,
  dayKey: string,
  measures: EvolutionMeasures,
): Promise<{ entry: EvolutionEntry; consultation: Consultation; consultationCreated: boolean }> {
  if (!isValidDayKey(dayKey)) throw new Error("Fecha inválida");
  const pro = await getProfessional();
  if (isFutureDayKey(dayKey, new Date(), pro.timezone)) {
    throw new FutureConsultationDateError(CONSULTATION_TEXT.futureMeasurementDate);
  }
  return prisma.$transaction(async (tx) => {
    const { consultation, created } = await findOrCreateConsultationForDay(tx, {
      patientId,
      dayKey,
      tz: pro.timezone,
    });
    const entry = await tx.evolutionEntry.create({
      data: {
        ...measures,
        patientId,
        recordedAt: dayKeyToNoonUtc(dayKey, pro.timezone),
        consultationId: consultation.id,
      },
    });
    return { entry, consultation, consultationCreated: created };
  });
}

/** Alta desde el detalle de la consulta. La fecha es el mediodía del día de la consulta. */
export async function addEvolutionEntryToConsultation(
  consultationId: string,
  measures: EvolutionMeasures,
): Promise<EvolutionEntry> {
  const pro = await getProfessional();
  const consultation = await prisma.consultation.findUniqueOrThrow({
    where: { id: consultationId },
    select: { id: true, patientId: true, consultedAt: true },
  });
  return prisma.evolutionEntry.create({
    data: {
      ...measures,
      patientId: consultation.patientId,
      recordedAt: dayKeyToNoonUtc(dayKeyInTz(consultation.consultedAt, pro.timezone), pro.timezone),
      consultationId: consultation.id,
    },
  });
}

export function deleteEvolutionEntry(id: string) {
  return prisma.evolutionEntry.delete({
    where: { id },
  });
}

export interface LatestMeasurement {
  value: number;
  recordedAt: Date;
}

export interface LatestFormulaMeasurements {
  weightKg: LatestMeasurement | null;
  heightCm: LatestMeasurement | null;
  bodyFatPercent: LatestMeasurement | null;
}

/** Último valor no nulo de cada medida, cada uno por separado (pueden ser de fechas distintas). */
export async function getLatestFormulaMeasurements(
  patientId: string,
): Promise<LatestFormulaMeasurements> {
  const [weight, height, bodyFat] = await Promise.all([
    prisma.evolutionEntry.findFirst({
      where: { patientId, weightKg: { not: null } },
      orderBy: { recordedAt: "desc" },
      select: { weightKg: true, recordedAt: true },
    }),
    prisma.evolutionEntry.findFirst({
      where: { patientId, heightCm: { not: null } },
      orderBy: { recordedAt: "desc" },
      select: { heightCm: true, recordedAt: true },
    }),
    prisma.evolutionEntry.findFirst({
      where: { patientId, bodyFatPercent: { not: null } },
      orderBy: { recordedAt: "desc" },
      select: { bodyFatPercent: true, recordedAt: true },
    }),
  ]);
  return {
    weightKg: weight?.weightKg != null ? { value: Number(weight.weightKg), recordedAt: weight.recordedAt } : null,
    heightCm: height?.heightCm != null ? { value: Number(height.heightCm), recordedAt: height.recordedAt } : null,
    bodyFatPercent:
      bodyFat?.bodyFatPercent != null
        ? { value: Number(bodyFat.bodyFatPercent), recordedAt: bodyFat.recordedAt }
        : null,
  };
}
