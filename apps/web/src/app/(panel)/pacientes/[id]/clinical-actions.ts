"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { upsertClinicalRecord, addEvolutionEntry, deleteEvolutionEntry } from "@nutri-bot/db/domain";

export type ActionState = { ok: boolean; error?: string };

const clinicalRecordSchema = z.object({
  patientId: z.string().min(1),
  background: z.string().trim().max(4000).optional().or(z.literal("")),
  goals: z.string().trim().max(4000).optional().or(z.literal("")),
});

export async function updateClinicalRecordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = clinicalRecordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  await upsertClinicalRecord(parsed.data.patientId, {
    background: parsed.data.background || null,
    goals: parsed.data.goals || null,
  });
  revalidatePath(`/pacientes/${parsed.data.patientId}`);
  return { ok: true };
}

const evolutionEntrySchema = z.object({
  patientId: z.string().min(1),
  recordedAt: z.string().min(1),
  weightKg: z.string().trim().optional().or(z.literal("")),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function addEvolutionEntryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = evolutionEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  const { patientId, recordedAt, weightKg, note } = parsed.data;
  const recordedDate = new Date(`${recordedAt}T12:00:00`);
  if (Number.isNaN(recordedDate.getTime())) return { ok: false, error: "Fecha inválida" };
  const parsedWeight = weightKg ? Number(weightKg.replace(",", ".")) : undefined;
  if (parsedWeight !== undefined && (Number.isNaN(parsedWeight) || parsedWeight <= 0)) {
    return { ok: false, error: "Peso inválido" };
  }
  await addEvolutionEntry(patientId, {
    recordedAt: recordedDate,
    weightKg: parsedWeight ?? null,
    note: note || null,
  });
  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}

const deleteEntrySchema = z.object({
  id: z.string().min(1),
  patientId: z.string().min(1),
});

export async function deleteEvolutionEntryAction(formData: FormData): Promise<void> {
  const parsed = deleteEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await deleteEvolutionEntry(parsed.data.id);
  revalidatePath(`/pacientes/${parsed.data.patientId}`);
}
