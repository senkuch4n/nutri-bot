"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ISAK_MEASURE_KEYS, ISAK_TEXT, validateIsakForm, type IsakFieldErrors, type IsakMeasureKey } from "@nutri-bot/core";
import {
  IsakStudyExistsError,
  IsakStudyNotFoundError,
  createIsakStudy,
  deleteIsakStudy,
  updateIsakStudy,
} from "@nutri-bot/db/domain";
import { belongsToPatient } from "@/lib/consultation-guard";
import type { ActionState } from "./clinical-actions";

// Estudio antropométrico ISAK de la consulta (HU-006). La validación de las medidas vive en
// packages/core (validateIsakForm) y la escritura en packages/db/domain/isak.ts.

export type IsakFormState = { ok: boolean; error?: string; fieldErrors?: IsakFieldErrors };

const INVALID = { ok: false, error: "Datos inválidos" } as const;
const idSchema = z.string().min(1);

const saveSchema = z.object({
  patientId: idSchema,
  consultationId: idSchema,
  entryId: z.string().optional(),
});

function revalidateIsak(patientId: string, consultationId: string) {
  revalidatePath(`/pacientes/${patientId}`);
  revalidatePath(`/pacientes/${patientId}/consultas/${consultationId}`);
  revalidatePath(`/pacientes/${patientId}/consultas/${consultationId}/antropometria`);
}

export async function saveIsakStudyAction(_prev: IsakFormState, formData: FormData): Promise<IsakFormState> {
  const parsed = saveSchema.safeParse({
    patientId: formData.get("patientId"),
    consultationId: formData.get("consultationId"),
    entryId: formData.get("entryId") ?? undefined,
  });
  if (!parsed.success) return INVALID;
  const { patientId, consultationId } = parsed.data;
  const entryId = parsed.data.entryId?.trim() || null;
  if (!(await belongsToPatient(patientId, consultationId))) return INVALID;

  const raw: Partial<Record<IsakMeasureKey, string>> = {};
  for (const key of ISAK_MEASURE_KEYS) {
    const value = formData.get(key);
    raw[key] = typeof value === "string" ? value : "";
  }
  const validation = validateIsakForm(raw);
  if (!validation.ok) return { ok: false, fieldErrors: validation.errors };

  try {
    if (entryId) await updateIsakStudy({ consultationId, entryId, measures: validation.measures });
    else await createIsakStudy({ consultationId, measures: validation.measures });
  } catch (error) {
    if (error instanceof IsakStudyExistsError) return { ok: false, error: ISAK_TEXT.alreadyExists };
    if (error instanceof IsakStudyNotFoundError) return INVALID;
    console.error("saveIsakStudyAction", error);
    return { ok: false, error: ISAK_TEXT.saveError };
  }
  revalidateIsak(patientId, consultationId);
  return { ok: true };
}

export async function deleteIsakStudyAction(
  patientId: string,
  consultationId: string,
  entryId: string,
): Promise<ActionState> {
  const ids = z.tuple([idSchema, idSchema, idSchema]).safeParse([patientId, consultationId, entryId]);
  if (!ids.success) return INVALID;
  if (!(await belongsToPatient(patientId, consultationId))) return INVALID;
  try {
    await deleteIsakStudy({ consultationId, entryId });
  } catch (error) {
    if (!(error instanceof IsakStudyNotFoundError)) console.error("deleteIsakStudyAction", error);
    return { ok: false, error: ISAK_TEXT.deleteError };
  }
  revalidateIsak(patientId, consultationId);
  return { ok: true };
}
