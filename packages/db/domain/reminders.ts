import {
  messages,
  parseServiceReminders,
  pickDueReminder,
  relativeDayPhrase,
  reminderStatusItems,
  type ReminderStatusItem,
} from "@nutri-bot/core";
import { prisma } from "../index";
import { getProfessional } from "./availability";
import { enqueueMessage } from "./outbox";

/** Filtro opcional para pruebas: limita los crons a estos pacientes (nunca toca turnos ajenos). */
export interface EnqueueScope {
  patientIds?: string[];
}

/** Manda las recomendaciones previas a estudios que las tengan configuradas. */
export async function enqueuePrepInstructions(windowMinutes = 20, scope: EnqueueScope = {}): Promise<number> {
  const pro = await getProfessional();
  const now = Date.now();
  const due = await prisma.appointment.findMany({
    where: {
      status: "CONFIRMED",
      startsAt: { gte: new Date(now) },
      service: {
        prepInstructions: { not: null },
        prepLeadHours: { not: null },
      },
      messages: { none: { kind: "PREP_INSTRUCTIONS" } },
      ...(scope.patientIds ? { patientId: { in: scope.patientIds } } : {}),
    },
    include: { patient: true, service: true },
  });

  let count = 0;
  for (const appt of due) {
    if (!appt.service.prepInstructions || appt.service.prepLeadHours === null) continue;
    // Todo turno futuro que ya entró en las `prepLeadHours` previas y todavía no las recibió:
    // así también las reciben los turnos reservados con menos anticipación que el aviso.
    const horizon = new Date(now + appt.service.prepLeadHours * 3_600_000 + windowMinutes * 60_000);
    if (appt.startsAt >= horizon) continue;
    await enqueueMessage({
      toJid: appt.patient.whatsappJid,
      kind: "PREP_INSTRUCTIONS",
      appointmentId: appt.id,
      body: messages.prepInstructionsMessage({
        serviceName: appt.service.name,
        startsAt: appt.startsAt,
        tz: pro.timezone,
        instructions: appt.service.prepInstructions,
      }),
    });
    count++;
  }
  return count;
}

// ── HU-014: recordatorios por servicio ──────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
/** Horizonte de búsqueda: 14 días de máximo + margen del corrimiento nocturno (D6). */
const REMINDERS_HORIZON_MS = 15 * DAY_MS;

export interface ServiceRemindersResult {
  /** REMINDER automáticos encolados en esta corrida. */
  reminders: number;
  /** CONFIRMATION_REQUEST encolados en esta corrida. */
  confirmations: number;
}

/**
 * HU-014. Reemplaza a enqueueDueReminders + enqueueAttendanceConfirmations. Idempotente: decide
 * con `pickDueReminder` qué recordatorio corresponde ahora a cada turno CONFIRMED futuro (hasta 15
 * días) según la config vigente de su servicio (aunque esté desactivado, D9) y lo encola.
 * El que pide confirmar manda el CONFIRMATION_REQUEST de siempre y, solo si se creó la fila, marca
 * `confirmationRequestedAt` y pone la conversación en CONFIRM_ATTENDANCE.
 * Un error en un turno no corta los demás; se re-lanza al final solo si fallaron todos los turnos
 * que tenían algo para encolar.
 * Consumidores: bot (workers.ts: cron y arranque) y scripts de prueba.
 */
export async function enqueueServiceReminders(
  opts: { now?: Date; scope?: EnqueueScope } = {},
): Promise<ServiceRemindersResult> {
  const pro = await getProfessional();
  const now = opts.now ?? new Date();
  const scope = opts.scope ?? {};
  const appts = await prisma.appointment.findMany({
    where: {
      status: "CONFIRMED",
      startsAt: { gt: now, lte: new Date(now.getTime() + REMINDERS_HORIZON_MS) },
      ...(scope.patientIds ? { patientId: { in: scope.patientIds } } : {}),
    },
    include: {
      patient: true,
      service: true,
      messages: {
        where: { kind: { in: ["REMINDER", "CONFIRMATION_REQUEST"] } },
        select: { kind: true, dedupeKey: true, createdAt: true },
      },
    },
  });

  const result: ServiceRemindersResult = { reminders: 0, confirmations: 0 };
  let attempted = 0;
  const errors: unknown[] = [];
  for (const appt of appts) {
    try {
      // Mensajes automáticos ya encolados (los manuales no cuentan, D8). SDD §15: cubren cualquier
      // recordatorio con momento ≤ su createdAt (cambio de config con avisos ya enviados).
      const autoMsgs = appt.messages.filter(
        (m) => m.kind === "CONFIRMATION_REQUEST" || (m.kind === "REMINDER" && m.dedupeKey.startsWith("auto:")),
      );
      const pick = pickDueReminder({
        startsAt: appt.startsAt,
        bookedAt: appt.bookedAt ?? appt.createdAt,
        reminders: parseServiceReminders(appt.service.reminders),
        tz: pro.timezone,
        now,
        sent: {
          autoKeys: new Set(autoMsgs.filter((m) => m.kind === "REMINDER").map((m) => m.dedupeKey)),
          confirmationSent:
            appt.messages.some((m) => m.kind === "CONFIRMATION_REQUEST") || appt.confirmationRequestedAt !== null,
          autoSentAt: [
            ...autoMsgs.map((m) => m.createdAt),
            ...(appt.confirmationRequestedAt ? [appt.confirmationRequestedAt] : []),
          ],
        },
      });
      if (!pick) continue;
      attempted++;
      const jid = appt.patient.whatsappJid;
      if (pick.reminder.asksConfirmation) {
        const created = await enqueueMessage({
          toJid: jid,
          kind: "CONFIRMATION_REQUEST",
          appointmentId: appt.id,
          body: messages.confirmAttendanceRequest({
            serviceName: appt.service.name,
            startsAt: appt.startsAt,
            tz: pro.timezone,
          }),
        });
        if (!created) continue;
        await prisma.appointment.update({
          where: { id: appt.id },
          data: { confirmationRequestedAt: now },
        });
        await prisma.conversationState.upsert({
          where: { patientJid: jid },
          create: { patientJid: jid, step: "CONFIRM_ATTENDANCE", context: { apptId: appt.id } },
          update: { step: "CONFIRM_ATTENDANCE", context: { apptId: appt.id } },
        });
        result.confirmations++;
      } else {
        const created = await enqueueMessage({
          toJid: jid,
          kind: "REMINDER",
          appointmentId: appt.id,
          dedupeKey: pick.key,
          body: messages.reminderMessage({
            patientName: appt.patient.name,
            serviceName: appt.service.name,
            startsAt: appt.startsAt,
            tz: pro.timezone,
            when: relativeDayPhrase(now, appt.startsAt, pro.timezone),
          }),
        });
        if (created) result.reminders++;
      }
    } catch (err) {
      errors.push(err);
    }
  }
  if (errors.length > 0 && errors.length === attempted) throw errors[0];
  return result;
}

export type ReminderNowResult = "queued" | "already_pending" | "not_applicable";

/**
 * Recordatorio manual (D8 a). Independiente de los automáticos: dedupeKey `manual:${now.toISOString()}`.
 * Consumidor: web (sendReminderNowAction).
 * - Turno inexistente → tira.
 * - status ≠ CONFIRMED o startsAt ≤ now → "not_applicable" (no encola).
 * - Ya hay un REMINDER manual PENDING del turno → "already_pending" (freno a doble clic).
 * - Si no, crea el REMINDER → "queued".
 * Todo en una transacción con el turno bloqueado (FOR UPDATE) para que dos clics simultáneos no
 * encolen dos.
 */
export async function enqueueReminderNow(
  appointmentId: string,
  opts: { now?: Date } = {},
): Promise<ReminderNowResult> {
  const pro = await getProfessional();
  const now = opts.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Appointment" WHERE id = ${appointmentId} FOR UPDATE`;
    const appt = await tx.appointment.findUnique({
      where: { id: appointmentId },
      include: { patient: true, service: true },
    });
    if (!appt) throw new Error(`Turno inexistente: ${appointmentId}`);
    if (appt.status !== "CONFIRMED" || appt.startsAt.getTime() <= now.getTime()) return "not_applicable";
    const pending = await tx.outboundMessage.findFirst({
      where: { appointmentId, kind: "REMINDER", status: "PENDING", dedupeKey: { startsWith: "manual:" } },
      select: { id: true },
    });
    if (pending) return "already_pending";
    await tx.outboundMessage.create({
      data: {
        toJid: appt.patient.whatsappJid,
        kind: "REMINDER",
        appointmentId: appt.id,
        dedupeKey: `manual:${now.toISOString()}`,
        body: messages.reminderMessage({
          patientName: appt.patient.name,
          serviceName: appt.service.name,
          startsAt: appt.startsAt,
          tz: pro.timezone,
          when: relativeDayPhrase(now, appt.startsAt, pro.timezone),
        }),
      },
    });
    return "queued";
  });
}

/**
 * Estado de los recordatorios de un turno para el detalle del panel (D8), con la config vigente
 * del servicio. Turno inexistente → []. Consumidor: web.
 */
export async function getAppointmentReminderStatus(
  appointmentId: string,
  opts: { now?: Date } = {},
): Promise<ReminderStatusItem[]> {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      service: true,
      messages: {
        where: { kind: { in: ["REMINDER", "CONFIRMATION_REQUEST"] } },
        select: { kind: true, dedupeKey: true, status: true, createdAt: true },
      },
    },
  });
  if (!appt) return [];
  const pro = await getProfessional();
  return reminderStatusItems({
    startsAt: appt.startsAt,
    bookedAt: appt.bookedAt ?? appt.createdAt,
    reminders: parseServiceReminders(appt.service.reminders),
    tz: pro.timezone,
    now: opts.now ?? new Date(),
    confirmationRequestedAt: appt.confirmationRequestedAt,
    messages: appt.messages.map((m) => ({
      kind: m.kind as "REMINDER" | "CONFIRMATION_REQUEST",
      dedupeKey: m.dedupeKey,
      status: m.status,
      createdAt: m.createdAt,
    })),
  });
}
