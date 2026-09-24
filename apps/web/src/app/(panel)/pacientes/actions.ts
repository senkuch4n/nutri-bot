"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nutri-bot/db";
import { updatePatientFormulaData } from "@nutri-bot/db/domain";
import {
  ACTIVITY_LEVEL_VALUES,
  BODY_FRAME_VALUES,
  NUTRITION_GOAL_VALUES,
  SEX_VALUES,
} from "@nutri-bot/core";

const schema = z.object({
  id: z.string().min(1),
  name: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  birthDate: z.string().trim().optional().or(z.literal("")),
});

export type PatientState = { ok: boolean; error?: string };

export async function updatePatientAction(
  _prev: PatientState,
  formData: FormData,
): Promise<PatientState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  await prisma.patient.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name || null,
      notes: parsed.data.notes || null,
      birthDate: parsed.data.birthDate ? new Date(`${parsed.data.birthDate}T12:00:00`) : null,
    },
  });
  revalidatePath(`/pacientes/${parsed.data.id}`);
  revalidatePath("/pacientes");
  return { ok: true };
}

// "" = "Sin cargar" → se guarda como null.
const emptyOr = <T extends readonly [string, ...string[]]>(values: T) =>
  z.union([z.enum(values), z.literal("")]);

const formulaDataSchema = z.object({
  id: z.string().min(1),
  sex: emptyOr(SEX_VALUES),
  activityLevel: emptyOr(ACTIVITY_LEVEL_VALUES),
  nutritionGoal: emptyOr(NUTRITION_GOAL_VALUES),
  bodyFrame: emptyOr(BODY_FRAME_VALUES),
});

export async function updateFormulaDataAction(
  _prev: PatientState,
  formData: FormData,
): Promise<PatientState> {
  const parsed = formulaDataSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  const { id, sex, activityLevel, nutritionGoal, bodyFrame } = parsed.data;
  await updatePatientFormulaData(id, {
    sex: sex || null,
    activityLevel: activityLevel || null,
    nutritionGoal: nutritionGoal || null,
    bodyFrame: bodyFrame || null,
  });
  revalidatePath(`/pacientes/${id}`);
  return { ok: true };
}
