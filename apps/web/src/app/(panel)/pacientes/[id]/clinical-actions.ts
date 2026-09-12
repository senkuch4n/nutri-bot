"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { upsertClinicalRecord, addEvolutionEntry, deleteEvolutionEntry } from "@nutri-bot/db/domain";

export type ActionState = { ok: boolean; error?: string };

const clinicalRecordSchema = z.object({
  patientId: z.string().min(1),
  background: z.string().trim().max(4000).optional().or(z.literal("")),
  goals: z.string().trim().max(4000).optional().or(z.literal("")),
  riskFlag: z.coerce.boolean().optional(),
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
    riskFlag: parsed.data.riskFlag ?? false,
  });
  revalidatePath(`/pacientes/${parsed.data.patientId}`);
  return { ok: true };
}

const optionalMeasure = z.string().trim().optional().or(z.literal(""));

const evolutionEntrySchema = z.object({
  patientId: z.string().min(1),
  recordedAt: z.string().min(1),
  weightKg: optionalMeasure,
  heightCm: optionalMeasure,
  waistCm: optionalMeasure,
  hipCm: optionalMeasure,
  armCm: optionalMeasure,
  thighCm: optionalMeasure,
  calfCm: optionalMeasure,
  tricepsSkinfoldMm: optionalMeasure,
  subscapularSkinfoldMm: optionalMeasure,
  abdominalSkinfoldMm: optionalMeasure,
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

const MEASURE_FIELDS = [
  "weightKg",
  "heightCm",
  "waistCm",
  "hipCm",
  "armCm",
  "thighCm",
  "calfCm",
  "tricepsSkinfoldMm",
  "subscapularSkinfoldMm",
  "abdominalSkinfoldMm",
] as const;

function parseMeasure(raw: string | undefined): number | null | undefined {
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function addEvolutionEntryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = evolutionEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  const { patientId, recordedAt, note } = parsed.data;
  const recordedDate = new Date(`${recordedAt}T12:00:00`);
  if (Number.isNaN(recordedDate.getTime())) return { ok: false, error: "Fecha inválida" };

  const measures: Record<string, number | null> = {};
  for (const field of MEASURE_FIELDS) {
    const value = parseMeasure(parsed.data[field]);
    if (value === undefined) return { ok: false, error: "Alguna medida es inválida" };
    measures[field] = value;
  }

  await addEvolutionEntry(patientId, {
    recordedAt: recordedDate,
    note: note || null,
    ...measures,
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
