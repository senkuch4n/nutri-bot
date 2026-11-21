import { google } from "googleapis";
import { prisma } from "../index";
import { resolveLegacyCalendarScope } from "./legacySchedulingScope";

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
  const { scope, agendaOwner, professional: pro } = await resolveLegacyCalendarScope();
  if (!pro.googleRefreshToken) return { processed: 0 };

  const appointmentScope = { ...scope, agenda: agendaOwner };
  const pending = await prisma.appointment.findMany({
    where: { ...appointmentScope, needsGoogleSync: true },
    // The appointment's composite FKs enforce same-tenant patient and service ownership.
    select: {
      id: true, status: true, googleEventId: true, startsAt: true, endsAt: true,
      patient: { select: { name: true, phone: true } },
      service: { select: { name: true } },
    },
    orderBy: { updatedAt: "asc" },
    take: 25,
  });
  if (pending.length === 0) return { processed: 0 };

  const calendar = google.calendar({ version: "v3", auth: oauthClient(pro.googleRefreshToken) });
  const calendarId = pro.googleCalendarId || "primary";
  const professionalScope = {
    id: agendaOwner.professionalId,
    tenantId: scope.tenantId,
    agendas: { some: { id: scope.agendaId, tenantId: scope.tenantId, ...agendaOwner } },
  };
  let processed = 0;

  try {
    for (const appt of pending) {
      const where = { id: appt.id, ...appointmentScope };
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
          where,
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
        await prisma.appointment.update({ where, data: { needsGoogleSync: false } });
      } else if (appt.status !== "CONFIRMED" && appt.googleEventId) {
        try {
          await calendar.events.delete({ calendarId, eventId: appt.googleEventId });
        } catch (err: unknown) {
          // 404/410: el evento ya no existe, lo damos por sincronizado.
          const code = (err as { code?: number })?.code;
          if (code !== 404 && code !== 410) throw err;
        }
        await prisma.appointment.update({
          where,
          data: { needsGoogleSync: false, googleEventId: null },
        });
      } else {
        await prisma.appointment.update({ where, data: { needsGoogleSync: false } });
      }
      processed++;
    }

    if (pro.googleSyncError) {
      await prisma.professional.update({ where: professionalScope, data: { googleSyncError: null }, select: { id: true } });
    }
    return { processed };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido de Google Calendar";
    await prisma.professional.update({ where: professionalScope, data: { googleSyncError: message }, select: { id: true } });
    return { processed, error: message };
  }
}
