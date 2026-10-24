"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nutri-bot/db";
import {
  archivePatient,
  getProfessional,
  unarchivePatient,
  updatePatientFormulaData,
} from "@nutri-bot/db/domain";
import {
  ACTIVITY_LEVEL_VALUES,
  BODY_FRAME_VALUES,
  NUTRITION_GOAL_VALUES,
  PATIENT_ARCHIVE_TEXT,
  PATIENT_DIRECTORY_TEXT,
  PHONE_INPUT_TEXT,
  SEX_VALUES,
  archiveBlockedText,
  isFutureDayKey,
  isValidDayKey,
  parsePhoneInput,
  patientDisplayName,
} from "@nutri-bot/core";
import { findOrCreatePatient, phoneToJid } from "@/lib/patients";

export type PatientState = { ok: boolean; error?: string };

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
  birthDateFuture: "La fecha de nacimiento no puede ser futura",
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
  if (!fieldErrors.birthDate && birthDate !== "") {
    const pro = await getProfessional();
    if (isFutureDayKey(birthDate, new Date(), pro.timezone)) fieldErrors.birthDate = PATIENT_DATA_TEXT.birthDateFuture;
  }
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

export type CreatePatientState = {
  ok: boolean;
  id?: string;
  name?: string;
  fieldErrors?: Partial<Record<"name" | "phone", string>>;
  /** El número ya es de otra paciente: no se crea nada y se ofrece abrir su ficha. */
  existingId?: string;
  /** HU-019 (D7): esa paciente está archivada → se ofrece "Desarchivar y abrir su ficha". */
  existingArchived?: boolean;
  error?: string;
};

/** "Nuevo paciente" sin pasar por el bot ni por un turno. Mismas reglas que la paciente nueva de
 *  "Nuevo turno": teléfono normalizado con parsePhoneInput y sin duplicar un número existente (así,
 *  cuando escriba por WhatsApp, el bot la encuentra por el mismo JID). */
export async function createPatientAction(
  _prev: CreatePatientState,
  formData: FormData,
): Promise<CreatePatientState> {
  const name = formText(formData, "name");
  const phone = parsePhoneInput(formText(formData, "phone"));

  const fieldErrors: NonNullable<CreatePatientState["fieldErrors"]> = {};
  if (name === "") fieldErrors.name = PATIENT_DIRECTORY_TEXT.nameRequired;
  else if (name.length > 120) fieldErrors.name = PATIENT_DIRECTORY_TEXT.nameTooLong;
  if (!phone.ok) fieldErrors.phone = PHONE_INPUT_TEXT[phone.error];
  if (Object.keys(fieldErrors).length > 0 || !phone.ok) return { ok: false, fieldErrors };

  try {
    const taken = await prisma.patient.findUnique({
      where: { whatsappJid: phoneToJid(phone.digits) },
      select: { id: true, name: true, phone: true, whatsappJid: true, archivedAt: true },
    });
    if (taken?.archivedAt) {
      return {
        ok: false,
        existingId: taken.id,
        existingArchived: true,
        fieldErrors: { phone: PATIENT_ARCHIVE_TEXT.phoneTakenArchived(patientDisplayName(taken)) },
      };
    }
    if (taken) {
      return {
        ok: false,
        existingId: taken.id,
        fieldErrors: { phone: PATIENT_DIRECTORY_TEXT.phoneTaken(patientDisplayName(taken)) },
      };
    }
    const created = await findOrCreatePatient({ phone: phone.digits, name });
    revalidatePath("/pacientes");
    return { ok: true, id: created.id, name };
  } catch {
    return { ok: false, error: PATIENT_DIRECTORY_TEXT.saveError };
  }
}

export type SetPatientNameState = { ok: boolean; error?: string; name?: string };

/** HU-017c-1 ("Poner nombre"): escribe SOLO Patient.name; no toca notas, fecha de nacimiento ni nada
 *  más. */
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

// ---------------------------------------------------------------------------
// HU-019: archivar / desarchivar desde la ficha.
// ---------------------------------------------------------------------------

export type ArchivePatientActionResult =
  | { ok: true; name: string | null }
  | { ok: false; error: string; blocked?: true };

function revalidateArchive(patientId: string) {
  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${patientId}`);
  revalidatePath("/avisos");
}

async function patientName(patientId: string): Promise<string | null> {
  const p = await prisma.patient.findUnique({ where: { id: patientId }, select: { name: true } });
  return p?.name?.trim() || null;
}

/** HU-019. Llama archivePatient(id). pending_appointments → { ok:false, blocked:true, error: archiveBlockedText }.
 *  not_found / excepción → { ok:false, error: archiveError }. ok → revalidatePath("/pacientes"),
 *  revalidatePath(`/pacientes/${id}`), revalidatePath("/avisos"). */
export async function archivePatientAction(patientId: string): Promise<ArchivePatientActionResult> {
  if (typeof patientId !== "string" || patientId.trim() === "") {
    return { ok: false, error: PATIENT_ARCHIVE_TEXT.archiveError };
  }
  try {
    const now = new Date();
    const result = await archivePatient(patientId, now);
    if (!result.ok) {
      if (result.reason === "not_found") return { ok: false, error: PATIENT_ARCHIVE_TEXT.archiveError };
      const [name, pro] = await Promise.all([patientName(patientId), getProfessional()]);
      return {
        ok: false,
        blocked: true,
        error: archiveBlockedText({
          name,
          startsAt: result.next.startsAt,
          moreCount: result.moreCount,
          now,
          tz: pro.timezone,
        }),
      };
    }
    const name = await patientName(patientId);
    revalidateArchive(patientId);
    return { ok: true, name };
  } catch {
    return { ok: false, error: PATIENT_ARCHIVE_TEXT.archiveError };
  }
}

/** HU-019. Llama unarchivePatient(id). not_found / excepción → { ok:false, error: unarchiveError }.
 *  ok → mismos revalidatePath. */
export async function unarchivePatientAction(
  patientId: string,
): Promise<{ ok: true; name: string | null } | { ok: false; error: string }> {
  if (typeof patientId !== "string" || patientId.trim() === "") {
    return { ok: false, error: PATIENT_ARCHIVE_TEXT.unarchiveError };
  }
  try {
    const result = await unarchivePatient(patientId);
    if (!result.ok) return { ok: false, error: PATIENT_ARCHIVE_TEXT.unarchiveError };
    const name = await patientName(patientId);
    revalidateArchive(patientId);
    return { ok: true, name };
  } catch {
    return { ok: false, error: PATIENT_ARCHIVE_TEXT.unarchiveError };
  }
}
