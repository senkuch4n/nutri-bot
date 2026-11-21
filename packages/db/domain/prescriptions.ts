import {
  REQUIREMENT_TEXT,
  ageGroupOf,
  buildPrescriptionSnapshot,
  computeAgeYears,
  dayKeyInTz,
  dayRangeUtc,
  type AgeGroup,
  type FormulaMeasurements,
  type PrescriptionChoices,
  type PrescriptionSnapshot,
  type ReferencePrescription,
  type RequirementContext,
} from "@nutri-bot/core";
import { prisma, type NutritionPrescription, type Patient } from "../index";
import { getFormulaMeasurementsAsOf } from "./clinical";
import { resolveLegacySchedulingScope } from "./legacySchedulingScope";

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
  /** HU-008: ADULT (≥ 18 o sin fecha de nacimiento), PEDIATRIC (5 a 17) o UNDER_5. */
  ageGroup: AgeGroup;
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
 *  `ctx` null si falta algo bloqueante (sexo, fecha de nacimiento, peso, talla) o si es menor de 5.
 *  HU-008: de 5 a 17 el ctx lleva population "PEDIATRIC". */
export async function getRequirementContextForConsultation(
  consultationId: string,
): Promise<RequirementContextForConsultation> {
  return loadRequirementContext(consultationId, await resolveLegacySchedulingScope());
}

async function loadRequirementContext(
  consultationId: string,
  { scope: { tenantId }, professional: { timezone } }: Awaited<ReturnType<typeof resolveLegacySchedulingScope>>,
): Promise<RequirementContextForConsultation> {
  const consultation = await prisma.consultation.findUniqueOrThrow({
    where: { id: consultationId, tenantId, patient: { tenantId } },
    select: {
      id: true,
      consultedAt: true,
      patient: {
        select: { id: true, sex: true, birthDate: true, activityLevel: true, nutritionGoal: true, bodyFrame: true },
      },
    },
  });
  const { patient, consultedAt } = consultation;
  const measurements = await getFormulaMeasurementsAsOf({
    patientId: patient.id,
    consultationId: consultation.id,
    until: measurementsUntil(consultedAt, timezone),
  });
  const ageYears = patient.birthDate ? computeAgeYears(patient.birthDate, consultedAt, timezone) : null;
  const weight = measurements.weightKg;
  const height = measurements.heightCm;
  const ageGroup = ageGroupOf(ageYears);
  const ctx: RequirementContext | null =
    patient.sex !== null && ageYears !== null && ageGroup !== "UNDER_5" && weight !== null && height !== null
      ? {
          population: ageGroup === "PEDIATRIC" ? "PEDIATRIC" : "ADULT",
          sex: patient.sex,
          ageYears,
          heightCm: height.value,
          actualWeightKg: weight.value,
          measuredBodyFatPercent: measurements.bodyFatPercent?.value ?? null,
        }
      : null;
  return { ctx, ageYears, ageGroup, measurements, patient, consultedAt };
}

/** Prescripción anterior de referencia (D1, D9, D12): la de la consulta del paciente con
 *  consultedAt más reciente que sea <= la de esta consulta, excluyendo esta; desempate
 *  createdAt desc de la consulta. null si no hay. Decimal → number. */
export async function getReferencePrescription(params: {
  patientId: string;
  consultationId: string;
  /** Retained for existing callers; the cutoff uses the persisted consultation date. */
  consultedAt: Date;
}): Promise<ReferencePrescription | null> {
  const { scope: { tenantId } } = await resolveLegacySchedulingScope();
  const patientScope = { patientId: params.patientId, tenantId, patient: { tenantId } };
  const anchor = await prisma.consultation.findUnique({
    where: { id: params.consultationId, ...patientScope },
    select: { consultedAt: true },
  });
  if (!anchor) return null;
  const p = await prisma.nutritionPrescription.findFirst({
    where: {
      consultation: {
        ...patientScope,
        id: { not: params.consultationId },
        consultedAt: { lte: anchor.consultedAt },
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
  const context = await resolveLegacySchedulingScope();
  const { scope: { tenantId } } = context;
  const { ctx, measurements, patient } = await loadRequirementContext(params.consultationId, context);
  if (ctx === null) throw new InvalidPrescriptionError(["Faltan datos para los cálculos"]);
  const result = buildPrescriptionSnapshot(ctx, params.choices);
  if (!result.ok) throw new InvalidPrescriptionError(result.errors);
  const snapshot = result.snapshot;
  const data = {
    ...snapshot,
    bodyFatRecordedAt:
      snapshot.bodyFatSource === "MEASURED" ? (measurements.bodyFatPercent?.recordedAt ?? null) : null,
  };
  const { consultationId } = params;
  const patientScope = { patientId: patient.id, patient: { tenantId } };
  return prisma.nutritionPrescription.upsert({
    where: { consultationId, consultation: { tenantId, ...patientScope } },
    create: {
      ...data,
      consultation: { connect: { id_tenantId: { id: consultationId, tenantId }, ...patientScope } },
    },
    update: data,
  });
}

/** Borra la prescripción de una consulta propia. Idempotente. */
export async function deleteConsultationPrescription(consultationId: string): Promise<void> {
  const { scope: { tenantId } } = await resolveLegacySchedulingScope();
  await prisma.nutritionPrescription.deleteMany({
    where: { consultationId, consultation: { tenantId, patient: { tenantId } } },
  });
}

/** Las `take` prescripciones más recientes del paciente, por consultation.consultedAt desc y
 *  consultation.createdAt desc, con { consultation: { id, consultedAt } }. */
export async function listLatestPrescriptions(
  patientId: string,
  take: number,
): Promise<Array<NutritionPrescription & { consultation: { id: string; consultedAt: Date } }>> {
  const { scope: { tenantId } } = await resolveLegacySchedulingScope();
  return prisma.nutritionPrescription.findMany({
    where: { consultation: { patientId, tenantId, patient: { tenantId } } },
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
    idealWeightDevineKg: decimalOrNull(p.idealWeightDevineKg),
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
    bmrSchofieldWeightHeightKcal: p.bmrSchofieldWeightHeightKcal,
    bmrSchofieldWeightKcal: p.bmrSchofieldWeightKcal,
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
