import { messages } from "@nutri-bot/core";
import { prisma } from "../index";
import { getProfessional } from "./availability";
import { enqueueMessage } from "./outbox";

/**
 * Encola recordatorios para los turnos CONFIRMED que empiezan dentro de la
 * ventana [ahora + leadHours, ahora + leadHours + windowMinutes] y que aún
 * no tienen un recordatorio. La restricción única (appointmentId, REMINDER)
 * garantiza que se envíe una sola vez.
 */
export async function enqueueDueReminders(windowMinutes = 20): Promise<number> {
  const pro = await getProfessional();
  const now = Date.now();
  const from = new Date(now + pro.reminderLeadHours * 3_600_000);
  const to = new Date(from.getTime() + windowMinutes * 60_000);

  const due = await prisma.appointment.findMany({
    where: {
      status: "CONFIRMED",
      startsAt: { gte: from, lt: to },
      messages: { none: { kind: "REMINDER" } },
    },
    include: { patient: true, service: true },
  });

  let count = 0;
  for (const appt of due) {
    await enqueueMessage({
      toJid: appt.patient.whatsappJid,
      kind: "REMINDER",
      appointmentId: appt.id,
      body: messages.reminderMessage({
        patientName: appt.patient.name,
        serviceName: appt.service.name,
        startsAt: appt.startsAt,
        tz: pro.timezone,
      }),
    });
    count++;
  }
  return count;
}

/** Pide confirmar asistencia a los turnos que empiezan en ~3 días. */
/** Filtro opcional para pruebas: limita los crons a estos pacientes (nunca toca turnos ajenos). */
export interface EnqueueScope {
  patientIds?: string[];
}

export async function enqueueAttendanceConfirmations(windowMinutes = 30, scope: EnqueueScope = {}): Promise<number> {
  const pro = await getProfessional();
  const now = Date.now();
  const from = new Date(now + 72 * 3_600_000);
  const to = new Date(from.getTime() + windowMinutes * 60_000);
  const due = await prisma.appointment.findMany({
    where: {
      status: "CONFIRMED",
      startsAt: { gte: from, lt: to },
      messages: { none: { kind: "CONFIRMATION_REQUEST" } },
      ...(scope.patientIds ? { patientId: { in: scope.patientIds } } : {}),
    },
    include: { patient: true, service: true },
  });

  let count = 0;
  for (const appt of due) {
    await enqueueMessage({
      toJid: appt.patient.whatsappJid,
      kind: "CONFIRMATION_REQUEST",
      appointmentId: appt.id,
      body: messages.confirmAttendanceRequest({
        serviceName: appt.service.name,
        startsAt: appt.startsAt,
        tz: pro.timezone,
      }),
    });
    await prisma.appointment.update({
      where: { id: appt.id },
      data: { confirmationRequestedAt: new Date() },
    });
    await prisma.conversationState.upsert({
      where: { patientJid: appt.patient.whatsappJid },
      create: { patientJid: appt.patient.whatsappJid, step: "CONFIRM_ATTENDANCE", context: { apptId: appt.id } },
      update: { step: "CONFIRM_ATTENDANCE", context: { apptId: appt.id } },
    });
    count++;
  }
  return count;
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

/** Recordatorio inmediato disparado manualmente desde el panel. */
export async function enqueueReminderNow(appointmentId: string): Promise<void> {
  const pro = await getProfessional();
  const appt = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { patient: true, service: true },
  });
  await enqueueMessage({
    toJid: appt.patient.whatsappJid,
    kind: "REMINDER",
    appointmentId: appt.id,
    body: messages.reminderMessage({
      patientName: appt.patient.name,
      serviceName: appt.service.name,
      startsAt: appt.startsAt,
      tz: pro.timezone,
    }),
  });
}
