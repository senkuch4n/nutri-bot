"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nutri-bot/db";
import { updatePatientFormulaData } from "@nutri-bot/db/domain";
import {
  ACTIVITY_LEVEL_VALUES,
  BODY_FRAME_VALUES,
  NUTRITION_GOAL_VALUES,
  PATIENT_DIRECTORY_TEXT,
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
  // "layout" también refresca el detalle de la consulta, desde donde se completa con el Sheet (HU-004).
  revalidatePath(`/pacientes/${id}`, "layout");
  return { ok: true };
}

export type SetPatientNameState = { ok: boolean; error?: string; name?: string };

/** HU-017c-1 ("Poner nombre"): escribe SOLO Patient.name; no toca notas, fecha de nacimiento ni nada
 *  más (a diferencia de updatePatientAction, que pisa con null lo que no viene en el form). */
export async function setPatientNameAction(
  _prev: SetPatientNameState,
  formData: FormData,
): Promise<SetPatientNameState> {
  const id = formData.get("id");
  const rawName = formData.get("name");
  if (typeof id !== "string" || id.trim() === "") return { ok: false, error: PATIENT_DIRECTORY_TEXT.saveError };
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (name === "") return { ok: false, error: PATIENT_DIRECTORY_TEXT.nameRequired };
  if (name.length > 120) return { ok: false, error: PATIENT_DIRECTORY_TEXT.nameTooLong };
  try {
    await prisma.patient.update({ where: { id }, data: { name } });
  } catch {
    return { ok: false, error: PATIENT_DIRECTORY_TEXT.saveError };
  }
  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${id}`);
  return { ok: true, name };
}
