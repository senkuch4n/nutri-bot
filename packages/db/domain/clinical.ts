import { prisma } from "../index";

export function getClinicalRecord(patientId: string) {
  return prisma.clinicalRecord.findUnique({
    where: { patientId },
  });
}

export function upsertClinicalRecord(
  patientId: string,
  data: { background?: string | null; goals?: string | null },
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
