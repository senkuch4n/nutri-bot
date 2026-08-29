"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  cancelAppointment,
  createAppointment,
  setAppointmentStatus,
  SlotUnavailableError,
} from "@/lib/appointments";
import { findOrCreatePatient } from "@/lib/patients";
import { enqueueReminderNow } from "@nutri-bot/db/domain";

export type ActionResult = { ok: boolean; error?: string };

const createSchema = z.object({
  patientName: z.string().trim().min(2, "Nombre requerido"),
  patientPhone: z.string().trim().min(6, "Teléfono requerido"),
  serviceId: z.string().min(1, "Elegí un servicio"),
  startsAt: z.string().datetime({ message: "Horario inválido" }),
});

export async function createAppointmentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

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
    });
  } catch (err) {
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

export async function sendReminderNowAction(id: string): Promise<ActionResult> {
  try {
    await enqueueReminderNow(id);
  } catch {
    return { ok: false, error: "No se pudo encolar el recordatorio." };
  }
  revalidatePath("/avisos");
  return { ok: true };
}

export async function setStatusAction(
  id: string,
  status: "COMPLETED" | "NO_SHOW" | "CONFIRMED",
): Promise<ActionResult> {
  try {
    await setAppointmentStatus({ id, status });
  } catch {
    return { ok: false, error: "No se pudo actualizar el turno." };
  }
  revalidatePath("/");
  return { ok: true };
}
