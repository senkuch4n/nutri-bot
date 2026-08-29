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
