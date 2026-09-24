import {
  CONSULTATION_TEXT,
  dayKeyInTz,
  dayKeyToNoonUtc,
  isFutureDayKey,
  isValidDayKey,
  pickFormulaMeasurements,
  type FormulaMeasurements,
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

const toNumber = (value: { toString(): string } | number | null): number | null =>
  value === null ? null : Number(value);

/**
 * HU-004 (D4). Entradas del paciente con recordedAt < `until` (o todas si until es null),
 * elegidas con pickFormulaMeasurements(entries, consultationId): primero las de la consulta, después
 * la más reciente anterior. Un solo findMany; Decimal → number.
 */
export async function getFormulaMeasurementsAsOf(params: {
  patientId: string;
  consultationId: string | null;
  until: Date | null;
}): Promise<FormulaMeasurements> {
  const rows = await prisma.evolutionEntry.findMany({
    where: {
      patientId: params.patientId,
      ...(params.until ? { recordedAt: { lt: params.until } } : {}),
    },
    select: {
      consultationId: true,
      recordedAt: true,
      createdAt: true,
      weightKg: true,
      heightCm: true,
      waistCm: true,
      hipCm: true,
      bodyFatPercent: true,
      basalMetabolicRateKcal: true,
    },
  });
  return pickFormulaMeasurements(
    rows.map((r) => ({
      consultationId: r.consultationId,
      recordedAt: r.recordedAt,
      createdAt: r.createdAt,
      weightKg: toNumber(r.weightKg),
      heightCm: toNumber(r.heightCm),
      waistCm: toNumber(r.waistCm),
      hipCm: toNumber(r.hipCm),
      bodyFatPercent: toNumber(r.bodyFatPercent),
      basalMetabolicRateKcal: r.basalMetabolicRateKcal,
    })),
    params.consultationId,
  );
}

/** Último valor no nulo de cada medida, cada uno por separado (pueden ser de fechas distintas).
 *  Delega en getFormulaMeasurementsAsOf sin consulta ni tope. */
export async function getLatestFormulaMeasurements(
  patientId: string,
): Promise<LatestFormulaMeasurements> {
  const m = await getFormulaMeasurementsAsOf({ patientId, consultationId: null, until: null });
  const pick = (v: FormulaMeasurements[keyof FormulaMeasurements]): LatestMeasurement | null =>
    v === null ? null : { value: v.value, recordedAt: v.recordedAt };
  return {
    weightKg: pick(m.weightKg),
    heightCm: pick(m.heightCm),
    bodyFatPercent: pick(m.bodyFatPercent),
  };
}
