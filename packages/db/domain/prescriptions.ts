import {
  REQUIREMENT_TEXT,
  buildPrescriptionSnapshot,
  computeAgeYears,
  dayKeyInTz,
  dayRangeUtc,
  isMinor,
  type FormulaMeasurements,
  type PrescriptionChoices,
  type PrescriptionSnapshot,
  type ReferencePrescription,
  type RequirementContext,
} from "@nutri-bot/core";
import { prisma, type NutritionPrescription, type Patient } from "../index";
import { getProfessional } from "./availability";
import { getFormulaMeasurementsAsOf } from "./clinical";

// Prescripción energética de una consulta (HU-004). La usa solo web. El servidor recalcula todo
// con packages/core: del cliente solo se toman las elecciones (`choices`).

export class InvalidPrescriptionError extends Error {
  constructor(public readonly reasons: string[]) {
    super(REQUIREMENT_TEXT.invalid);
    this.name = "InvalidPrescriptionError";
  }
}

export type RequirementContextForConsultation = {
  ctx: RequirementContext | null;
  ageYears: number | null;
  measurements: FormulaMeasurements;
  patient: Pick<Patient, "id" | "sex" | "birthDate" | "activityLevel" | "nutritionGoal" | "bodyFrame">;
  consultedAt: Date;
};

/** Tope de mediciones de una consulta: inicio del día siguiente en la zona de la profesional
 *  (entran las del mismo día, nunca las posteriores). */
function measurementsUntil(consultedAt: Date, tz: string): Date {
  return dayRangeUtc(dayKeyInTz(consultedAt, tz), tz).end;
}

/** Contexto de la calculadora para una consulta: paciente, edad a la fecha, mediciones D4.
 *  `ctx` es null si falta algo bloqueante (sexo, fecha de nacimiento, peso, talla) o si es menor. */
export async function getRequirementContextForConsultation(
  consultationId: string,
): Promise<RequirementContextForConsultation> {
  const [pro, consultation] = await Promise.all([
    getProfessional(),
    prisma.consultation.findUniqueOrThrow({
      where: { id: consultationId },
      select: {
        id: true,
        consultedAt: true,
        patient: {
          select: { id: true, sex: true, birthDate: true, activityLevel: true, nutritionGoal: true, bodyFrame: true },
        },
      },
    }),
  ]);
  const { patient, consultedAt } = consultation;
  const measurements = await getFormulaMeasurementsAsOf({
    patientId: patient.id,
    consultationId: consultation.id,
    until: measurementsUntil(consultedAt, pro.timezone),
  });
  const ageYears = patient.birthDate ? computeAgeYears(patient.birthDate, consultedAt, pro.timezone) : null;
  const weight = measurements.weightKg;
  const height = measurements.heightCm;
  const ctx: RequirementContext | null =
    patient.sex !== null && ageYears !== null && !isMinor(ageYears) && weight !== null && height !== null
      ? {
          sex: patient.sex,
          ageYears,
          heightCm: height.value,
          actualWeightKg: weight.value,
          measuredBodyFatPercent: measurements.bodyFatPercent?.value ?? null,
        }
      : null;
  return { ctx, ageYears, measurements, patient, consultedAt };
}

/** Prescripción anterior de referencia (D1, D9, D12): la de la consulta del paciente con
 *  consultedAt más reciente que sea <= la de esta consulta, excluyendo esta; desempate
 *  createdAt desc de la consulta. null si no hay. Decimal → number. */
export async function getReferencePrescription(params: {
  patientId: string;
  consultationId: string;
  consultedAt: Date;
}): Promise<ReferencePrescription | null> {
  const p = await prisma.nutritionPrescription.findFirst({
    where: {
      consultation: {
        patientId: params.patientId,
        id: { not: params.consultationId },
        consultedAt: { lte: params.consultedAt },
      },
    },
    orderBy: [{ consultation: { consultedAt: "desc" } }, { consultation: { createdAt: "desc" } }],
    select: {
      bmrFormula: true,
      adjustmentRange: true,
      adjustmentPercent: true,
      macroMode: true,
      proteinPercent: true,
      fatPercent: true,
      carbPercent: true,
      proteinGPerKg: true,
    },
  });
  if (!p) return null;
  return {
    bmrFormula: p.bmrFormula,
    adjustmentRange: p.adjustmentRange,
    adjustmentPercent: p.adjustmentPercent,
    macroMode: p.macroMode,
    proteinPercent: Number(p.proteinPercent),
    fatPercent: Number(p.fatPercent),
    carbPercent: Number(p.carbPercent),
    proteinGPerKg: p.proteinGPerKg === null ? null : Number(p.proteinGPerKg),
  };
}

/**
 * Crea o reemplaza (upsert por consultationId) la prescripción. Recalcula todo con
 * buildPrescriptionSnapshot usando getRequirementContextForConsultation; del cliente solo toma
 * `choices`. Tira InvalidPrescriptionError si ctx es null o si el snapshot tiene errores.
 * bodyFatRecordedAt = measurements.bodyFatPercent.recordedAt si bodyFatSource = MEASURED, si no null.
 * No toca Patient (D10).
 */
export async function saveConsultationPrescription(params: {
  consultationId: string;
  choices: PrescriptionChoices;
}): Promise<NutritionPrescription> {
  const { ctx, measurements } = await getRequirementContextForConsultation(params.consultationId);
  if (ctx === null) throw new InvalidPrescriptionError(["Faltan datos para los cálculos"]);
  const result = buildPrescriptionSnapshot(ctx, params.choices);
  if (!result.ok) throw new InvalidPrescriptionError(result.errors);
  const snapshot = result.snapshot;
  const data = {
    ...snapshot,
    bodyFatRecordedAt:
      snapshot.bodyFatSource === "MEASURED" ? (measurements.bodyFatPercent?.recordedAt ?? null) : null,
  };
  return prisma.nutritionPrescription.upsert({
    where: { consultationId: params.consultationId },
    create: { ...data, consultationId: params.consultationId },
    update: data,
  });
}

/** Borra la prescripción de la consulta (deleteMany por consultationId). Idempotente. */
export async function deleteConsultationPrescription(consultationId: string): Promise<void> {
  await prisma.nutritionPrescription.deleteMany({ where: { consultationId } });
}

/** Las `take` prescripciones más recientes del paciente, por consultation.consultedAt desc y
 *  consultation.createdAt desc, con { consultation: { id, consultedAt } }. */
export function listLatestPrescriptions(
  patientId: string,
  take: number,
): Promise<Array<NutritionPrescription & { consultation: { id: string; consultedAt: Date } }>> {
  return prisma.nutritionPrescription.findMany({
    where: { consultation: { patientId } },
    include: { consultation: { select: { id: true, consultedAt: true } } },
    orderBy: [{ consultation: { consultedAt: "desc" } }, { consultation: { createdAt: "desc" } }],
    take,
  });
}

const decimalOrNull = (value: { toString(): string } | null): number | null =>
  value === null ? null : Number(value);

/** NutritionPrescription (Decimal) → PrescriptionSnapshot (number). */
export function toPrescriptionSnapshot(p: NutritionPrescription): PrescriptionSnapshot {
  return {
    sex: p.sex,
    ageYears: p.ageYears,
    heightCm: Number(p.heightCm),
    actualWeightKg: Number(p.actualWeightKg),
    idealWeightDevineKg: Number(p.idealWeightDevineKg),
    weightBasis: p.weightBasis,
    weightUsedKg: Number(p.weightUsedKg),
    bodyFatPercent: decimalOrNull(p.bodyFatPercent),
    bodyFatSource: p.bodyFatSource,
    bmrFormula: p.bmrFormula,
    bmrKcal: p.bmrKcal,
    bmrMifflinStJeorKcal: p.bmrMifflinStJeorKcal,
    bmrHarrisBenedictKcal: p.bmrHarrisBenedictKcal,
    bmrKatchMcArdleKcal: p.bmrKatchMcArdleKcal,
    bmrCunninghamKcal: p.bmrCunninghamKcal,
    activityLevel: p.activityLevel,
    activityFactor: Number(p.activityFactor),
    totalExpenditureKcal: p.totalExpenditureKcal,
    nutritionGoal: p.nutritionGoal,
    adjustmentRange: p.adjustmentRange,
    adjustmentPercent: p.adjustmentPercent,
    calculatedVctKcal: p.calculatedVctKcal,
    prescribedVctKcal: p.prescribedVctKcal,
    macroMode: p.macroMode,
    proteinPercent: Number(p.proteinPercent),
    fatPercent: Number(p.fatPercent),
    carbPercent: Number(p.carbPercent),
    proteinGPerKg: decimalOrNull(p.proteinGPerKg),
    proteinG: p.proteinG,
    fatG: p.fatG,
    carbG: p.carbG,
  };
}
