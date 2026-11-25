"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nutri-bot/db";
import {
  CONSULTATION_NOTES_MAX,
  CONSULTATION_TEXT,
  isValidDayKey,
  pickConsultationForDay,
} from "@nutri-bot/core";
import {
  AppointmentConsultationDateError,
  ConsultationNotDeletableError,
  ConsultationPlanMismatchError,
  FutureConsultationDateError,
  addEvolutionEntryToConsultation,
  createManualConsultation,
  createPlanForConsultation,
  deleteConsultation,
  deleteEvolutionEntry,
  listConsultationsOnDay,
  saveConsultationNotes,
  setConsultationPlan,
  updateManualConsultationDate,
} from "@nutri-bot/db/domain";
import { belongsToPatient } from "@/lib/consultation-guard";
import { requireTenantContext } from "@/lib/tenant-context";
import type { ActionState } from "./clinical-actions";
import { parseMeasuresFromForm } from "./measure-form-data";

// Acciones de la consulta (HU-003). Todas verifican que la consulta sea del paciente de la URL
// antes de operar; la lógica vive en packages/db/domain/consultations.ts.

export type ConsultationFormState = {
  ok: boolean;
  error?: string;
  consultationId?: string;
  existingConsultationId?: string;
};

const INVALID = { ok: false, error: "Datos inválidos" } as const;

const idSchema = z.string().min(1);

function revalidateConsultation(patientId: string, consultationId: string) {
  revalidatePath(`/pacientes/${patientId}`);
  revalidatePath(`/pacientes/${patientId}/consultas/${consultationId}`);
}

// ─── Nueva consulta / cambiar fecha ─────────────────────────────────────────────

const createSchema = z.object({
  patientId: idSchema,
  day: z.string().trim(),
  force: z.literal("1").optional(),
});

export async function createConsultationAction(
  _prev: ConsultationFormState,
  formData: FormData,
): Promise<ConsultationFormState> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return INVALID;
  const { patientId, day, force } = parsed.data;
  if (!isValidDayKey(day)) return { ok: false, error: "Fecha inválida" };

  // HU-025: paciente del consultorio de la sesión; uno de otro consultorio es como inexistente.
  const ctx = await requireTenantContext("write").catch(() => null);
  if (!ctx) return INVALID;
  const patient = await prisma.patient.findUnique({
    where: { id_tenantId: { id: patientId, tenantId: ctx.tenantId } },
    select: { id: true },
  });
  if (!patient) return INVALID;

  try {
    if (force !== "1") {
      const sameDay = await listConsultationsOnDay(ctx, patientId, day);
      const existing = pickConsultationForDay(sameDay);
      if (existing) {
        return { ok: false, error: CONSULTATION_TEXT.sameDayExists, existingConsultationId: existing.id };
      }
    }
    const consultation = await createManualConsultation(ctx, { patientId, dayKey: day });
    revalidateConsultation(patientId, consultation.id);
    return { ok: true, consultationId: consultation.id };
  } catch (err) {
    if (err instanceof FutureConsultationDateError) return { ok: false, error: err.message };
    return { ok: false, error: "No se pudo crear la consulta." };
  }
}

const updateDateSchema = z.object({
  patientId: idSchema,
  consultationId: idSchema,
  day: z.string().trim(),
});

export async function updateConsultationDateAction(
  _prev: ConsultationFormState,
  formData: FormData,
): Promise<ConsultationFormState> {
  const parsed = updateDateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return INVALID;
  const { patientId, consultationId, day } = parsed.data;
  if (!isValidDayKey(day)) return { ok: false, error: "Fecha inválida" };
  const ctx = await requireTenantContext("write").catch(() => null);
  if (!ctx || !(await belongsToPatient(ctx, patientId, consultationId))) return INVALID;

  try {
    await updateManualConsultationDate(ctx, { consultationId, dayKey: day });
  } catch (err) {
    if (err instanceof FutureConsultationDateError || err instanceof AppointmentConsultationDateError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "No se pudo cambiar la fecha." };
  }
  revalidateConsultation(patientId, consultationId);
  return { ok: true, consultationId };
}

// ─── Notas ──────────────────────────────────────────────────────────────────────

const notesSchema = z.object({
  patientId: idSchema,
  consultationId: idSchema,
  notes: z.string().max(CONSULTATION_NOTES_MAX).optional().or(z.literal("")),
});

export async function saveConsultationNotesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = notesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "No se pudieron guardar las notas." };
  const { patientId, consultationId, notes } = parsed.data;
  const ctx = await requireTenantContext("write").catch(() => null);
  if (!ctx || !(await belongsToPatient(ctx, patientId, consultationId))) return INVALID;
  try {
    await saveConsultationNotes(ctx, { consultationId, notes: notes ?? null });
  } catch {
    return { ok: false, error: "No se pudieron guardar las notas." };
  }
  revalidateConsultation(patientId, consultationId);
  return { ok: true };
}

// ─── Plan indicado ──────────────────────────────────────────────────────────────

const setPlanSchema = z.object({
  patientId: idSchema,
  consultationId: idSchema,
  planId: idSchema,
});

export async function setConsultationPlanAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = setPlanSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Elegí un plan" };
  const { patientId, consultationId, planId } = parsed.data;
  const ctx = await requireTenantContext("write").catch(() => null);
  if (!ctx || !(await belongsToPatient(ctx, patientId, consultationId))) return INVALID;
  try {
    await setConsultationPlan(ctx, { consultationId, planId });
  } catch (err) {
    if (err instanceof ConsultationPlanMismatchError) return INVALID;
    return { ok: false, error: "No se pudo indicar el plan." };
  }
  revalidateConsultation(patientId, consultationId);
  return { ok: true };
}

export async function clearConsultationPlanAction(
  patientId: string,
  consultationId: string,
): Promise<ActionState> {
  if (!idSchema.safeParse(patientId).success || !idSchema.safeParse(consultationId).success) return INVALID;
  const ctx = await requireTenantContext("write").catch(() => null);
  if (!ctx || !(await belongsToPatient(ctx, patientId, consultationId))) return INVALID;
  try {
    await setConsultationPlan(ctx, { consultationId, planId: null });
  } catch {
    return { ok: false, error: "No se pudo quitar el plan." };
  }
  revalidateConsultation(patientId, consultationId);
  return { ok: true };
}

export async function createPlanForConsultationAction(patientId: string, consultationId: string): Promise<void> {
  if (!idSchema.safeParse(patientId).success || !idSchema.safeParse(consultationId).success) return;
  const ctx = await requireTenantContext("write").catch(() => null);
  if (!ctx || !(await belongsToPatient(ctx, patientId, consultationId))) return;
  const plan = await createPlanForConsultation(ctx, { consultationId });
  revalidateConsultation(patientId, consultationId);
  redirect(`/pacientes/${patientId}/planes/${plan.id}`);
}

// ─── Mediciones ─────────────────────────────────────────────────────────────────

export async function addConsultationMeasurementAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = Object.fromEntries(formData) as Record<string, string | undefined>;
  const ids = z.object({ patientId: idSchema, consultationId: idSchema }).safeParse(raw);
  if (!ids.success) return INVALID;
  const { patientId, consultationId } = ids.data;
  const ctx = await requireTenantContext("write").catch(() => null);
  if (!ctx || !(await belongsToPatient(ctx, patientId, consultationId))) return INVALID;

  const measures = parseMeasuresFromForm(raw);
  if (!measures.ok) return { ok: false, error: measures.error };

  try {
    await addEvolutionEntryToConsultation(ctx, consultationId, measures.measures);
  } catch {
    return { ok: false, error: "No se pudo agregar la medición." };
  }
  revalidateConsultation(patientId, consultationId);
  return { ok: true };
}

export async function deleteConsultationMeasurementAction(
  patientId: string,
  consultationId: string,
  entryId: string,
): Promise<ActionState> {
  if (![patientId, consultationId, entryId].every((v) => idSchema.safeParse(v).success)) return INVALID;
  const ctx = await requireTenantContext("write").catch(() => null);
  if (!ctx || !(await belongsToPatient(ctx, patientId, consultationId))) return INVALID;
  const entry = await prisma.evolutionEntry.findFirst({
    where: { id: entryId, tenantId: ctx.tenantId, patient: { tenantId: ctx.tenantId } },
    select: { consultationId: true },
  });
  if (!entry || entry.consultationId !== consultationId) return INVALID;
  try {
    await deleteEvolutionEntry(ctx, entryId);
  } catch {
    return { ok: false, error: "No se pudo borrar la medición." };
  }
  revalidateConsultation(patientId, consultationId);
  return { ok: true };
}

// ─── Eliminar consulta ──────────────────────────────────────────────────────────

/**
 * Sin `redirect()` (HU-017c-3, D12a): el borrado es diferido y corre 8 s después, cuando la
 * profesional ya está en otra pantalla. La navegación a `?tab=consultas` la hace el cliente al
 * programar el borrado.
 */
export async function deleteConsultationAction(patientId: string, consultationId: string): Promise<ActionState> {
  if (!idSchema.safeParse(patientId).success || !idSchema.safeParse(consultationId).success) return INVALID;
  const ctx = await requireTenantContext("write").catch(() => null);
  if (!ctx || !(await belongsToPatient(ctx, patientId, consultationId))) return INVALID;
  try {
    await deleteConsultation(ctx, consultationId);
  } catch (err) {
    if (err instanceof ConsultationNotDeletableError) return { ok: false, error: CONSULTATION_TEXT.notDeletable };
    return { ok: false, error: "No se pudo eliminar la consulta." };
  }
  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}
