"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nutri-bot/db";
import {
  AGENDA_TEXT,
  PHONE_INPUT_TEXT,
  buildPatientDirectory,
  classifyWhatsappJid,
  parsePhoneInput,
  patientDisplayName,
  reminderStatusText,
  validateBookingReasonInput,
  type PatientDirectoryInput,
  type PatientDirectoryRow,
} from "@nutri-bot/core";
import {
  cancelAppointment,
  createAppointment,
  InvalidBookingReasonError,
  setAppointmentStatus,
  SlotUnavailableError,
  updateAppointmentReason,
} from "@/lib/appointments";
import { findOrCreatePatient, phoneToJid } from "@/lib/patients";
import { enqueueReminderNow, getAppointmentReminderStatus, getProfessional } from "@nutri-bot/db/domain";

export type ActionResult = { ok: boolean; error?: string };

export type CreateAppointmentResult = ActionResult & {
  /** Solo cuando se pidió una paciente nueva con un número que ya es de otra (Q10). */
  existingPatient?: { id: string; name: string | null; label: string }; // label = patientDisplayName
};

const T = AGENDA_TEXT.create;

const createSchema = z.object({
  patientId: z.string().trim().optional(),
  patientName: z.string().optional(),
  patientPhone: z.string().optional(),
  serviceId: z.string({ required_error: T.serviceRequired }).trim().min(1, T.serviceRequired),
  startsAt: z.string({ required_error: T.chooseTime }).datetime({ message: T.chooseTime }),
  /** HU-013: tope grueso contra payloads enormes; la regla real es validateBookingReasonInput. */
  reason: z.string().max(5000).optional(),
});

/**
 * HU-017b-1 (SDD 4.6). Paciente existente (`patientId`): no se llama a findOrCreatePatient ni se
 * escribe Patient (no se toca el nombre: D4a). Paciente nueva (`patientName` + `patientPhone` en
 * formato libre): si el número ya es de otra paciente, se devuelve `existingPatient` sin crear nada (Q10).
 */
export async function createAppointmentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<CreateAppointmentResult> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const r = validateBookingReasonInput(parsed.data.reason);
  if (!r.ok) return { ok: false, error: r.error };

  try {
    let patientId: string;
    if (parsed.data.patientId) {
      const existing = await prisma.patient.findUnique({
        where: { id: parsed.data.patientId },
        select: { id: true, whatsappJid: true },
      });
      if (!existing || classifyWhatsappJid(existing.whatsappJid) === "not_person") {
        return { ok: false, error: T.patientGone };
      }
      patientId = existing.id;
    } else {
      const name = (parsed.data.patientName ?? "").trim();
      if (name.length < 2) return { ok: false, error: T.nameRequired };
      const phone = parsePhoneInput(parsed.data.patientPhone ?? "");
      if (!phone.ok) return { ok: false, error: PHONE_INPUT_TEXT[phone.error] };
      const taken = await prisma.patient.findUnique({
        where: { whatsappJid: phoneToJid(phone.digits) },
        select: { id: true, name: true, phone: true, whatsappJid: true },
      });
      if (taken) {
        const label = patientDisplayName(taken);
        return {
          ok: false,
          error: T.existing(label),
          existingPatient: { id: taken.id, name: taken.name?.trim() || null, label },
        };
      }
      const created = await findOrCreatePatient({ phone: phone.digits, name });
      patientId = created.id;
    }

    await createAppointment({
      patientId,
      serviceId: parsed.data.serviceId,
      startsAt: new Date(parsed.data.startsAt),
      createdBy: "PROFESSIONAL",
      reason: r.reason,
    });
  } catch (err) {
    if (err instanceof InvalidBookingReasonError) return { ok: false, error: err.message };
    if (err instanceof SlotUnavailableError) return { ok: false, error: T.slotGone };
    return { ok: false, error: T.genericError };
  }

  revalidatePath("/");
  return { ok: true };
}

/** Pacientes para el buscador de "Nuevo turno" (lectura; Q7). Solo contactos persona, con nombre
 *  primero (orden de buildPatientDirectory) y después los sin nombre. statusLine = próximo turno o
 *  "Sin turno" (sin consultas ni ConversationState: no hacen falta acá). */
export type AppointmentPatientOption = Pick<
  PatientDirectoryRow,
  "id" | "name" | "contactKind" | "phoneLabel" | "phoneDigits" | "searchName" | "statusLine"
>;

export async function listAppointmentPatientsAction(): Promise<AppointmentPatientOption[]> {
  const now = new Date();
  const [pro, patients] = await Promise.all([
    getProfessional(),
    prisma.patient.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        whatsappJid: true,
        createdAt: true,
        appointments: {
          where: { status: { in: ["CONFIRMED", "AWAITING_PAYMENT"] }, startsAt: { gte: now } },
          orderBy: { startsAt: "asc" },
          take: 1,
          select: { startsAt: true, status: true },
        },
      },
    }),
  ]);
  const inputs: PatientDirectoryInput[] = patients.map((p) => {
    const next = p.appointments[0];
    return {
      id: p.id,
      name: p.name,
      phone: p.phone,
      whatsappJid: p.whatsappJid,
      createdAt: p.createdAt,
      nextAppointment:
        next && (next.status === "CONFIRMED" || next.status === "AWAITING_PAYMENT")
          ? { startsAt: next.startsAt, status: next.status }
          : null,
      lastConsultationAt: null,
      lastContactAt: null,
    };
  });
  const { named, unnamed } = buildPatientDirectory(inputs, now, pro.timezone);
  return [...named, ...unnamed].map((row) => ({
    id: row.id,
    name: row.name,
    contactKind: row.contactKind,
    phoneLabel: row.phoneLabel,
    phoneDigits: row.phoneDigits,
    searchName: row.searchName,
    statusLine: row.statusLine,
  }));
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
