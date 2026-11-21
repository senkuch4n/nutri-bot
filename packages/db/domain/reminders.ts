import {
  messages,
  parseServiceReminders,
  pickDueReminder,
  relativeDayPhrase,
  reminderStatusItems,
  type ReminderStatusItem,
} from "@nutri-bot/core";
import { prisma, type Prisma } from "../index";
import { bindLegacyAppointmentConversationState } from "./conversationState";
import { resolveLegacySchedulingScope } from "./legacySchedulingScope";
import { enqueueMessage } from "./outbox";

/** Filtro opcional para pruebas: limita los crons a estos pacientes (nunca toca turnos ajenos). */
export interface EnqueueScope {
  patientIds?: string[];
}

type LegacyScope = Awaited<ReturnType<typeof resolveLegacySchedulingScope>>["scope"];

function appointmentScope(scope: LegacyScope) {
  return { ...scope, patient: { tenantId: scope.tenantId }, service: { tenantId: scope.tenantId } };
}

function hasOwnedRelations(
  appt: { tenantId: string | null; agendaId: string | null; patient: { tenantId: string | null } | null; service: { tenantId: string | null } | null },
  scope: LegacyScope,
): boolean {
  return appt.tenantId === scope.tenantId && appt.agendaId === scope.agendaId &&
    appt.patient?.tenantId === scope.tenantId && appt.service?.tenantId === scope.tenantId;
}

function currentAppointmentWhere(
  appt: { id: string; patientId: string; serviceId: string; startsAt: Date; updatedAt: Date; patient: { whatsappJid: string } },
  scope: LegacyScope,
) {
  return {
    ...appointmentScope(scope), id: appt.id, status: "CONFIRMED", startsAt: appt.startsAt,
    updatedAt: appt.updatedAt, patientId: appt.patientId, serviceId: appt.serviceId,
    patient: { tenantId: scope.tenantId, whatsappJid: appt.patient.whatsappJid },
  } satisfies Prisma.AppointmentWhereUniqueInput;
}

function appointmentMessageScope({ tenantId }: LegacyScope) {
  // Historical messages without an explicit owner inherit it from the verified appointment.
  return { OR: [{ tenantId }, { tenantId: null }] };
}

/** Manda las recomendaciones previas a estudios que las tengan configuradas. */
export async function enqueuePrepInstructions(windowMinutes = 20, scope: EnqueueScope = {}): Promise<number> {
  const { scope: legacy, professional: pro } = await resolveLegacySchedulingScope();
  const now = Date.now();
  const due = await prisma.appointment.findMany({
    where: {
      ...appointmentScope(legacy),
      status: "CONFIRMED",
      startsAt: { gte: new Date(now) },
      service: {
        tenantId: legacy.tenantId,
        prepInstructions: { not: null },
        prepLeadHours: { not: null },
      },
      messages: { none: { ...appointmentMessageScope(legacy), kind: "PREP_INSTRUCTIONS" } },
      ...(scope.patientIds ? { patientId: { in: scope.patientIds } } : {}),
    },
    include: { patient: true, service: true },
  });

  let count = 0;
  for (const appt of due) {
    if (!hasOwnedRelations(appt, legacy) || !appt.service.prepInstructions || appt.service.prepLeadHours === null) continue;
    // Todo turno futuro que ya entró en las `prepLeadHours` previas y todavía no las recibió:
    // así también las reciben los turnos reservados con menos anticipación que el aviso.
    const horizon = new Date(now + appt.service.prepLeadHours * 3_600_000 + windowMinutes * 60_000);
    if (appt.startsAt >= horizon) continue;
    const current = await prisma.appointment.findUnique({ where: currentAppointmentWhere(appt, legacy), select: { id: true } });
    if (!current) continue;
    const created = await enqueueMessage({
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
    if (created) count++;
  }
  return count;
}

// ── HU-014: recordatorios por servicio ──────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
/** HU-022: prefijo del dedupeKey de los mensajes ya enviados de un horario anterior del turno
 *  (lo pone rescheduleAppointment). No cuentan para el horario vigente. */
export const PREVIOUS_SCHEDULE_KEY_PREFIX = "prev:";

function isCurrentScheduleMessage(m: { dedupeKey: string }): boolean {
  return !m.dedupeKey.startsWith(PREVIOUS_SCHEDULE_KEY_PREFIX);
}
/** Horizonte de búsqueda: 14 días de máximo + margen del corrimiento nocturno (D6). */
const REMINDERS_HORIZON_MS = 15 * DAY_MS;
const STALE_CONFIRMATION = Symbol("stale confirmation appointment");

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
  const { scope: legacy, professional: pro } = await resolveLegacySchedulingScope();
  const now = opts.now ?? new Date();
  const scope = opts.scope ?? {};
  const appts = await prisma.appointment.findMany({
    where: {
      ...appointmentScope(legacy),
      status: "CONFIRMED",
      startsAt: { gt: now, lte: new Date(now.getTime() + REMINDERS_HORIZON_MS) },
      ...(scope.patientIds ? { patientId: { in: scope.patientIds } } : {}),
    },
    include: {
      patient: true,
      service: true,
      messages: {
        where: { ...appointmentMessageScope(legacy), kind: { in: ["REMINDER", "CONFIRMATION_REQUEST"] } },
        select: { kind: true, dedupeKey: true, createdAt: true },
      },
    },
  });

  const result: ServiceRemindersResult = { reminders: 0, confirmations: 0 };
  let attempted = 0;
  const errors: unknown[] = [];
  for (const appt of appts) {
    if (!hasOwnedRelations(appt, legacy)) continue;
    try {
      // HU-022 (S6): los del horario anterior (prev:) no cuentan para ningún chequeo.
      const msgs = appt.messages.filter(isCurrentScheduleMessage);
      // Mensajes automáticos ya encolados (los manuales no cuentan, D8). SDD §15: cubren cualquier
      // recordatorio con momento ≤ su createdAt (cambio de config con avisos ya enviados).
      const autoMsgs = msgs.filter(
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
            msgs.some((m) => m.kind === "CONFIRMATION_REQUEST") || appt.confirmationRequestedAt !== null,
          autoSentAt: [
            ...autoMsgs.map((m) => m.createdAt),
            ...(appt.confirmationRequestedAt ? [appt.confirmationRequestedAt] : []),
          ],
        },
      });
      if (!pick) continue;
      attempted++;
      const where = currentAppointmentWhere(appt, legacy);
      const jid = appt.patient.whatsappJid;
      if (pick.reminder.asksConfirmation) {
        const body = messages.confirmAttendanceRequest({
          serviceName: appt.service.name,
          startsAt: appt.startsAt,
          tz: pro.timezone,
        });
        const claimed = await prisma.$transaction(async (tx) => {
          // Same order as rescheduling: original Professional first, then outbox,
          // appointment write and conversation. Recheck the schedule after any lock wait.
          const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "Professional"
            WHERE id = 1 AND "tenantId" = ${legacy.tenantId} FOR UPDATE`;
          if (locked.length !== 1) return false;
          const state = await bindLegacyAppointmentConversationState(tx);
          const pending = { ...where, confirmationRequestedAt: null };
          const current = await tx.appointment.findUnique({ where: pending, select: { id: true } });
          if (!current) return false;
          const created = await enqueueMessage({
            toJid: jid, kind: "CONFIRMATION_REQUEST", appointmentId: appt.id, body,
          }, tx);
          if (!created) return false;
          const { count } = await tx.appointment.updateMany({
            where: pending,
            data: { confirmationRequestedAt: now },
          });
          // El turno cambió desde la lectura: revertir también el mensaje recién encolado.
          if (count !== 1) throw STALE_CONFIRMATION;
          await state.upsertAttendancePrompt(jid, appt.id);
          return true;
        });
        if (claimed) result.confirmations++;
      } else {
        const current = await prisma.appointment.findUnique({ where, select: { id: true } });
        if (!current) continue;
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
      if (err !== STALE_CONFIRMATION) errors.push(err);
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
  const now = opts.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const { scope, professional: pro } = await resolveLegacySchedulingScope(tx);
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Appointment"
      WHERE id = ${appointmentId} AND "tenantId" = ${scope.tenantId} AND "agendaId" = ${scope.agendaId}
      FOR UPDATE`;
    if (locked.length !== 1) throw new Error(`Turno inexistente: ${appointmentId}`);
    const appt = await tx.appointment.findUnique({
      where: { id: appointmentId, ...appointmentScope(scope) },
      include: { patient: true, service: true },
    });
    if (!appt || !hasOwnedRelations(appt, scope)) throw new Error(`Turno inexistente: ${appointmentId}`);
    if (appt.status !== "CONFIRMED" || appt.startsAt.getTime() <= now.getTime()) return "not_applicable";
    const pending = await tx.outboundMessage.findFirst({
      where: { ...appointmentMessageScope(scope), appointmentId, kind: "REMINDER", status: "PENDING", dedupeKey: { startsWith: "manual:" } },
      select: { id: true },
    });
    if (pending) return "already_pending";
    await tx.outboundMessage.create({
      data: {
        toJid: appt.patient.whatsappJid,
        kind: "REMINDER",
        appointmentId: appt.id,
        tenantId: scope.tenantId,
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
  const { scope, professional: pro } = await resolveLegacySchedulingScope();
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId, ...appointmentScope(scope) },
    include: {
      patient: { select: { tenantId: true } },
      service: true,
      messages: {
        where: { ...appointmentMessageScope(scope), kind: { in: ["REMINDER", "CONFIRMATION_REQUEST"] } },
        select: { kind: true, dedupeKey: true, status: true, createdAt: true },
      },
    },
  });
  if (!appt || !hasOwnedRelations(appt, scope)) return [];
  return reminderStatusItems({
    startsAt: appt.startsAt,
    bookedAt: appt.bookedAt ?? appt.createdAt,
    reminders: parseServiceReminders(appt.service.reminders),
    tz: pro.timezone,
    now: opts.now ?? new Date(),
    confirmationRequestedAt: appt.confirmationRequestedAt,
    // HU-022: los del horario anterior (prev:) no son del turno tal como está ahora.
    messages: appt.messages.filter(isCurrentScheduleMessage).map((m) => ({
      kind: m.kind as "REMINDER" | "CONFIRMATION_REQUEST",
      dedupeKey: m.dedupeKey,
      status: m.status,
      createdAt: m.createdAt,
    })),
  });
}
