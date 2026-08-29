import { google } from "googleapis";
import { prisma } from "../index";
import { getProfessional } from "./availability";

function oauthClient(refreshToken: string) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

/**
 * Reconcilia los turnos marcados con needsGoogleSync contra el Google
 * Calendar de la profesional (sincronización de una vía app -> Google).
 */
export async function syncGoogleCalendar(): Promise<{ processed: number; error?: string }> {
  const pro = await getProfessional();
  if (!pro.googleRefreshToken) return { processed: 0 };

  const pending = await prisma.appointment.findMany({
    where: { needsGoogleSync: true },
    include: { patient: true, service: true },
    orderBy: { updatedAt: "asc" },
    take: 25,
  });
  if (pending.length === 0) return { processed: 0 };

  const calendar = google.calendar({ version: "v3", auth: oauthClient(pro.googleRefreshToken) });
  const calendarId = pro.googleCalendarId || "primary";
  let processed = 0;

  try {
    for (const appt of pending) {
      if (appt.status === "CONFIRMED" && !appt.googleEventId) {
        const res = await calendar.events.insert({
          calendarId,
          requestBody: {
            summary: `${appt.service.name} — ${appt.patient.name ?? appt.patient.phone}`,
            description: `Paciente: ${appt.patient.name ?? "s/n"} (${appt.patient.phone})\nServicio: ${appt.service.name}`,
            start: { dateTime: appt.startsAt.toISOString(), timeZone: pro.timezone },
            end: { dateTime: appt.endsAt.toISOString(), timeZone: pro.timezone },
          },
        });
        await prisma.appointment.update({
          where: { id: appt.id },
          data: { googleEventId: res.data.id ?? null, needsGoogleSync: false },
        });
      } else if (appt.status === "CONFIRMED" && appt.googleEventId) {
        await calendar.events.patch({
          calendarId,
          eventId: appt.googleEventId,
          requestBody: {
            start: { dateTime: appt.startsAt.toISOString(), timeZone: pro.timezone },
            end: { dateTime: appt.endsAt.toISOString(), timeZone: pro.timezone },
          },
        });
        await prisma.appointment.update({ where: { id: appt.id }, data: { needsGoogleSync: false } });
      } else if (appt.status !== "CONFIRMED" && appt.googleEventId) {
        try {
          await calendar.events.delete({ calendarId, eventId: appt.googleEventId });
        } catch (err: unknown) {
          // 404/410: el evento ya no existe, lo damos por sincronizado.
          const code = (err as { code?: number })?.code;
          if (code !== 404 && code !== 410) throw err;
        }
        await prisma.appointment.update({
          where: { id: appt.id },
          data: { needsGoogleSync: false, googleEventId: null },
        });
      } else {
        await prisma.appointment.update({ where: { id: appt.id }, data: { needsGoogleSync: false } });
      }
      processed++;
    }

    if (pro.googleSyncError) {
      await prisma.professional.update({ where: { id: 1 }, data: { googleSyncError: null } });
    }
    return { processed };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido de Google Calendar";
    await prisma.professional.update({ where: { id: 1 }, data: { googleSyncError: message } });
    return { processed, error: message };
  }
}
