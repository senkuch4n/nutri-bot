import { prisma } from "../index";

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

export function addEvolutionEntry(
  patientId: string,
  data: {
    recordedAt: Date;
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
  },
) {
  return prisma.evolutionEntry.create({
    data: { patientId, ...data },
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
