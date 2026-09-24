"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ACTIVITY_LEVEL_VALUES,
  ADJUSTMENT_RANGE_VALUES,
  BMR_FORMULA_VALUES,
  NUTRITION_GOAL_VALUES,
  REQUIREMENT_TEXT,
} from "@nutri-bot/core";
import {
  InvalidPrescriptionError,
  deleteConsultationPrescription,
  saveConsultationPrescription,
} from "@nutri-bot/db/domain";
import { belongsToPatient } from "@/lib/consultation-guard";
import type { ActionState } from "./clinical-actions";

// Prescripción de la consulta (HU-004). zod solo valida forma y enums; los rangos (ajuste, VCT,
// macros, sumas) los valida buildPrescriptionSnapshot en el dominio, que recalcula todo.

const INVALID = { ok: false, error: REQUIREMENT_TEXT.invalid } as const;

const idSchema = z.string().min(1);

const prescriptionSchema = z.object({
  patientId: idSchema,
  consultationId: idSchema,
  bmrFormula: z.enum(BMR_FORMULA_VALUES),
  weightBasis: z.enum(["ACTUAL", "ADJUSTED"]),
  bodyFatSource: z.enum(["MEASURED", "DEURENBERG"]).nullable(),
  activityLevel: z.enum(ACTIVITY_LEVEL_VALUES),
  nutritionGoal: z.enum(NUTRITION_GOAL_VALUES),
  adjustmentRange: z.enum(ADJUSTMENT_RANGE_VALUES),
  adjustmentPercent: z.number().int().min(-100).max(100),
  prescribedVctKcal: z.number().int(),
  macros: z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("PERCENT_OF_VCT"),
      proteinPercent: z.number(),
      fatPercent: z.number(),
      carbPercent: z.number(),
    }),
    z.object({ mode: z.literal("PROTEIN_PER_KG"), proteinGPerKg: z.number(), fatPercent: z.number() }),
  ]),
});

function revalidateConsultation(patientId: string, consultationId: string) {
  revalidatePath(`/pacientes/${patientId}`);
  revalidatePath(`/pacientes/${patientId}/consultas/${consultationId}`);
}

/** Recibe un objeto plano (no FormData): lo llama el cliente desde un onClick + startTransition. */
export async function savePrescriptionAction(input: unknown): Promise<ActionState> {
  const parsed = prescriptionSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const { patientId, consultationId, ...choices } = parsed.data;
  if (!(await belongsToPatient(patientId, consultationId))) return INVALID;
  try {
    await saveConsultationPrescription({ consultationId, choices });
  } catch (err) {
    if (err instanceof InvalidPrescriptionError) return INVALID;
    return { ok: false, error: "No se pudo guardar la prescripción." };
  }
  revalidateConsultation(patientId, consultationId);
  return { ok: true };
}

export async function deletePrescriptionAction(patientId: string, consultationId: string): Promise<ActionState> {
  if (!idSchema.safeParse(patientId).success || !idSchema.safeParse(consultationId).success) return INVALID;
  if (!(await belongsToPatient(patientId, consultationId))) return INVALID;
  try {
    await deleteConsultationPrescription(consultationId);
  } catch {
    return { ok: false, error: "No se pudo borrar la prescripción." };
  }
  revalidateConsultation(patientId, consultationId);
  return { ok: true };
}
