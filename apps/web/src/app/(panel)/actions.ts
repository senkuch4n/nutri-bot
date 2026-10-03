"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { reminderStatusText, validateBookingReasonInput } from "@nutri-bot/core";
import {
  cancelAppointment,
  createAppointment,
  InvalidBookingReasonError,
  setAppointmentStatus,
  SlotUnavailableError,
  updateAppointmentReason,
} from "@/lib/appointments";
import { findOrCreatePatient } from "@/lib/patients";
import { enqueueReminderNow, getAppointmentReminderStatus } from "@nutri-bot/db/domain";

export type ActionResult = { ok: boolean; error?: string };

const createSchema = z.object({
  patientName: z.string().trim().min(2, "Nombre requerido"),
  patientPhone: z.string().trim().min(6, "Teléfono requerido"),
  serviceId: z.string().min(1, "Elegí un servicio"),
  startsAt: z.string().datetime({ message: "Horario inválido" }),
  /** HU-013: tope grueso contra payloads enormes; la regla real es validateBookingReasonInput. */
  reason: z.string().max(5000).optional(),
});

export async function createAppointmentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const r = validateBookingReasonInput(parsed.data.reason);
  if (!r.ok) return { ok: false, error: r.error };

  try {
    const patient = await findOrCreatePatient({
      phone: parsed.data.patientPhone,
      name: parsed.data.patientName,
    });
    await createAppointment({
      patientId: patient.id,
      serviceId: parsed.data.serviceId,
      startsAt: new Date(parsed.data.startsAt),
      createdBy: "PROFESSIONAL",
      reason: r.reason,
    });
  } catch (err) {
    if (err instanceof InvalidBookingReasonError) {
      return { ok: false, error: err.message };
    }
    if (err instanceof SlotUnavailableError) {
      return { ok: false, error: "Ese horario ya no está disponible. Elegí otro." };
    }
    return { ok: false, error: "No se pudo crear el turno." };
  }

  revalidatePath("/");
  return { ok: true };
}

export async function cancelAppointmentAction(id: string, reason?: string): Promise<ActionResult> {
  try {
    await cancelAppointment({ id, by: "PROFESSIONAL", reason });
  } catch {
    return { ok: false, error: "No se pudo cancelar el turno." };
  }
  revalidatePath("/");
  return { ok: true };
}

/**
 * HU-014 (D8): recordatorio manual, independiente de los automáticos. `already_pending` = freno a
 * doble clic (ya hay uno manual sin enviar).
 */
export async function sendReminderNowAction(
  id: string,
): Promise<ActionResult & { result?: "queued" | "already_pending" }> {
  let result: Awaited<ReturnType<typeof enqueueReminderNow>>;
  try {
    result = await enqueueReminderNow(id);
  } catch {
    return { ok: false, error: "No se pudo encolar el recordatorio." };
  }
  if (result === "not_applicable") {
    return { ok: false, error: "Solo se puede mandar a un turno confirmado que todavía no pasó." };
  }
  revalidatePath("/avisos");
  return { ok: true, result };
}

/** HU-014 (D8): línea de estado de los recordatorios del turno (solo lectura). */
export async function getAppointmentRemindersAction(
  id: string,
): Promise<{ ok: true; text: string } | { ok: false }> {
  try {
    return { ok: true, text: reminderStatusText(await getAppointmentReminderStatus(id)) };
  } catch {
    return { ok: false };
  }
}

/**
 * Cambia el estado del turno. La consulta del turno (HU-003) la crea o la quita el dominio
 * (`setAppointmentStatus`), no esta action.
 */
export async function setStatusAction(
  id: string,
  status: "COMPLETED" | "NO_SHOW" | "CONFIRMED",
): Promise<ActionResult & { consultation?: { id: string; created: boolean } | null }> {
  let result: Awaited<ReturnType<typeof setAppointmentStatus>>;
  try {
    result = await setAppointmentStatus({ id, status });
  } catch {
    return { ok: false, error: "No se pudo actualizar el turno." };
  }
  revalidatePath("/");
  if (result.consultation || result.removedEmptyConsultation) {
    revalidatePath(`/pacientes/${result.appointment.patientId}`);
  }
  return { ok: true, consultation: result.consultation };
}

const reasonSchema = z.object({ id: z.string().min(1), reason: z.string().max(5000) });

/** HU-013 (D5): editar el motivo desde el detalle del turno. No avisa al paciente. */
export async function saveAppointmentReasonAction(
  id: string,
  reason: string,
): Promise<ActionResult & { reason?: string | null }> {
  const parsed = reasonSchema.safeParse({ id, reason });
  if (!parsed.success) return { ok: false, error: "No se pudo guardar el motivo." };
  const r = validateBookingReasonInput(parsed.data.reason);
  if (!r.ok) return { ok: false, error: r.error };

  let updated: Awaited<ReturnType<typeof updateAppointmentReason>>;
  try {
    updated = await updateAppointmentReason({ id: parsed.data.id, reason: r.reason });
  } catch {
    return { ok: false, error: "No se pudo guardar el motivo." };
  }
  revalidatePath("/");
  revalidatePath(`/pacientes/${updated.patientId}`, "layout");
  return { ok: true, reason: updated.reason };
}
