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
  isValidDayKey,
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

export type PatientDataState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"name" | "birthDate" | "notes" | "background" | "goals", string>>;
};

const PATIENT_DATA_TEXT = {
  invalid: "Datos inválidos",
  birthDateInvalid: "Fecha inválida",
  notesTooLong: "Las notas pueden tener hasta 2000 caracteres",
  textTooLong: "Puede tener hasta 4000 caracteres",
} as const;

const formText = (formData: FormData, key: string): string => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

/** HU-017c-2 ("Editar datos", D9/Q8): un solo "Guardar" para datos personales, datos para calcular
 *  calorías y ficha clínica. Valida con los mismos límites de siempre y escribe todo en una sola
 *  transacción: si falla, no queda nada a medias. Solo escribe los campos del Sheet. */
export async function updatePatientDataAction(
  _prev: PatientDataState,
  formData: FormData,
): Promise<PatientDataState> {
  const id = formText(formData, "id");
  if (id === "") return { ok: false, error: PATIENT_DIRECTORY_TEXT.saveError };

  const name = formText(formData, "name");
  const birthDate = formText(formData, "birthDate");
  const notes = formText(formData, "notes");
  const background = formText(formData, "background");
  const goals = formText(formData, "goals");

  const fieldErrors: NonNullable<PatientDataState["fieldErrors"]> = {};
  if (name.length > 120) fieldErrors.name = PATIENT_DIRECTORY_TEXT.nameTooLong;
  if (birthDate !== "" && !isValidDayKey(birthDate)) fieldErrors.birthDate = PATIENT_DATA_TEXT.birthDateInvalid;
  if (notes.length > 2000) fieldErrors.notes = PATIENT_DATA_TEXT.notesTooLong;
  if (background.length > 4000) fieldErrors.background = PATIENT_DATA_TEXT.textTooLong;
  if (goals.length > 4000) fieldErrors.goals = PATIENT_DATA_TEXT.textTooLong;
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  const enums = z
    .object({
      sex: emptyOr(SEX_VALUES),
      activityLevel: emptyOr(ACTIVITY_LEVEL_VALUES),
      nutritionGoal: emptyOr(NUTRITION_GOAL_VALUES),
      bodyFrame: emptyOr(BODY_FRAME_VALUES),
    })
    .safeParse({
      sex: formText(formData, "sex"),
      activityLevel: formText(formData, "activityLevel"),
      nutritionGoal: formText(formData, "nutritionGoal"),
      bodyFrame: formText(formData, "bodyFrame"),
    });
  if (!enums.success) return { ok: false, error: PATIENT_DATA_TEXT.invalid };

  const clinical = {
    background: background || null,
    goals: goals || null,
    riskFlag: formData.get("riskFlag") === "true",
  };
  try {
    await prisma.$transaction([
      prisma.patient.update({
        where: { id },
        data: {
          name: name || null,
          // Columna @db.Date: medianoche UTC del día elegido (computeAgeYears lee el día en UTC).
          birthDate: birthDate ? new Date(`${birthDate}T00:00:00.000Z`) : null,
          notes: notes || null,
          sex: enums.data.sex || null,
          activityLevel: enums.data.activityLevel || null,
          nutritionGoal: enums.data.nutritionGoal || null,
          bodyFrame: enums.data.bodyFrame || null,
        },
      }),
      prisma.clinicalRecord.upsert({
        where: { patientId: id },
        update: clinical,
        create: { patientId: id, ...clinical },
      }),
    ]);
  } catch {
    return { ok: false, error: PATIENT_DIRECTORY_TEXT.saveError };
  }
  // "layout" también refresca la consulta y el estudio ISAK, que muestran estos datos.
  revalidatePath(`/pacientes/${id}`, "layout");
  revalidatePath("/pacientes");
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
