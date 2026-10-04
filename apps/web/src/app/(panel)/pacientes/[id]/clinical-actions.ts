"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nutri-bot/db";
import { formatInTimeZone, isValidDayKey } from "@nutri-bot/core";
import {
  FutureConsultationDateError,
  addEvolutionEntryOnDay,
  deleteEvolutionEntry,
} from "@nutri-bot/db/domain";
import { getProfessional } from "@/lib/professional";
import { MEASURE_FIELDS, parseMeasuresFromForm } from "./measure-form-data";

/** `message` (opcional): texto del toast de éxito cuando depende del resultado. */
export type ActionState = { ok: boolean; error?: string; message?: string };

const optionalMeasure = z.string().trim().optional().or(z.literal(""));

const evolutionEntrySchema = z.object({
  patientId: z.string().min(1),
  recordedAt: z.string().min(1),
  ...Object.fromEntries(MEASURE_FIELDS.map((f) => [f, optionalMeasure])),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

/**
 * Alta desde Evolución (HU-003, D4): la medición cae en la consulta de ese día o crea una
 * "Sin turno". La fecha se interpreta en la zona de la profesional y no puede ser futura.
 */
export async function addEvolutionEntryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = Object.fromEntries(formData) as Record<string, string | undefined>;
  const parsed = evolutionEntrySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  const { patientId, recordedAt } = parsed.data;
  if (!isValidDayKey(recordedAt)) return { ok: false, error: "Fecha inválida" };

  const measures = parseMeasuresFromForm(raw);
  if (!measures.ok) return { ok: false, error: measures.error };

  try {
    const [{ consultation }, pro] = await Promise.all([
      addEvolutionEntryOnDay(patientId, recordedAt, measures.measures),
      getProfessional(),
    ]);
    revalidatePath(`/pacientes/${patientId}`);
    revalidatePath(`/pacientes/${patientId}/consultas/${consultation.id}`);
    return {
      ok: true,
      message: `Medición agregada a la consulta del ${formatInTimeZone(consultation.consultedAt, pro.timezone, "dd/MM")}`,
    };
  } catch (err) {
    if (err instanceof FutureConsultationDateError) return { ok: false, error: err.message };
    return { ok: false, error: "No se pudo agregar la medición." };
  }
}

const idSchema = z.string().min(1);

/**
 * Borra una medición desde Historial (HU-017c-3). Reemplaza a `deleteEvolutionEntryAction(formData)`:
 * devuelve el resultado para el borrado diferido con "Deshacer". La medición tiene que ser del paciente.
 */
export async function deleteEvolutionEntryByIdAction(patientId: string, entryId: string): Promise<ActionState> {
  const failed = { ok: false, error: "No se pudo borrar la medición." } as const;
  if (!idSchema.safeParse(patientId).success || !idSchema.safeParse(entryId).success) return failed;
  try {
    const entry = await prisma.evolutionEntry.findUnique({
      where: { id: entryId },
      select: { patientId: true, consultationId: true },
    });
    if (!entry || entry.patientId !== patientId) return failed;
    await deleteEvolutionEntry(entryId);
    revalidatePath(`/pacientes/${patientId}`);
    if (entry.consultationId) revalidatePath(`/pacientes/${patientId}/consultas/${entry.consultationId}`);
    return { ok: true };
  } catch {
    return failed;
  }
}
