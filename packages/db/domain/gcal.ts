// HU-028b: sincronización de una vía app → Google Calendar, por consultorio (D5a). Solo escritura
// (events.insert/patch/delete, D15): nunca lee la lista de eventos, la disponibilidad ni los calendarios
// de la cuenta. El refresh token vive cifrado en GoogleCalendarAccount (INTEGRATION_TOKEN_KEY, AAD por
// consultorio). No se exporta desde domain/index.ts (subpath @nutri-bot/db/domain/googleCalendar).
import { google } from "googleapis";
import { prisma } from "../index";
import { GOOGLE_SECRET_AAD, loadIntegrationTokenKey, openSecret } from "./secretBox";
import { resolveTenantCalendarContext, type TenantRef } from "./tenantScope";

/** Calendario mínimo que usa la sync (solo escritura). Inyectable para tests y probes. */
export type CalendarEventsWriter = {
  insert(p: { calendarId: string; requestBody: object }): Promise<{ data: { id?: string | null } }>;
  patch(p: { calendarId: string; eventId: string; requestBody: object }): Promise<unknown>;
  delete(p: { calendarId: string; eventId: string }): Promise<unknown>;
};

export type GoogleCalendarSyncDeps = {
  env?: Record<string, string | undefined>;
  now?: () => Date;
  /** default: google.calendar({ version: "v3", auth: OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) + refresh_token }).events */
  events?: (refreshToken: string) => CalendarEventsWriter;
};

const DECRYPT_FAILED_MESSAGE = "No se pudo leer la conexión guardada. Reconectá Google Calendar.";

function defaultEvents(env: Record<string, string | undefined>): (refreshToken: string) => CalendarEventsWriter {
  return (refreshToken) => {
    const client = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
    client.setCredentials({ refresh_token: refreshToken });
    const events = google.calendar({ version: "v3", auth: client }).events;
    return {
      insert: (p) => events.insert(p),
      patch: (p) => events.patch(p),
      delete: (p) => events.delete(p),
    };
  };
}

const SAFE_CODE = /^[a-z0-9_.-]{1,64}$/i;

function errorStatus(err: unknown): number | null {
  const e = err as { response?: { status?: unknown }; code?: unknown } | null;
  if (typeof e?.response?.status === "number") return e.response.status;
  if (typeof e?.code === "number") return e.code;
  return null;
}

/** Mensaje saneado para syncError y logs. Nunca `err.message` ni nada de `err.config` (un GaxiosError
 *  trae `Authorization: Bearer ...`). Exportado solo para tests. */
export function describeGoogleCalendarError(err: unknown): string {
  const status = errorStatus(err);
  if (status === null) return "Google Calendar no respondió";
  const rawError = (err as { response?: { data?: { error?: unknown } } } | null)?.response?.data?.error;
  let code: string | null = null;
  if (typeof rawError === "string" && SAFE_CODE.test(rawError)) code = rawError;
  else if (rawError && typeof rawError === "object") {
    const nested = (rawError as { status?: unknown }).status;
    if (typeof nested === "string" && SAFE_CODE.test(nested)) code = nested;
  }
  return `Google Calendar respondió con error (status ${status}${code ? `, ${code}` : ""})`;
}

/**
 * Reconcilia los turnos marcados con needsGoogleSync del consultorio `t` contra su Google Calendar
 * (sincronización de una vía app -> Google).
 */
export async function syncGoogleCalendar(
  t: TenantRef,
  deps: GoogleCalendarSyncDeps = {},
): Promise<{ processed: number; error?: string }> {
  const env = deps.env ?? process.env;
  const nowFn = deps.now ?? (() => new Date());
  const account = await prisma.googleCalendarAccount.findUnique({
    where: { tenantId: t.tenantId },
    select: { refreshTokenEnc: true, calendarId: true, syncError: true },
  });
  if (!account?.refreshTokenEnc) return { processed: 0 };
  const refreshTokenEnc = account.refreshTokenEnc;

  const { scope, agendaOwner, professional: pro } = await resolveTenantCalendarContext(prisma, t.tenantId);
  const { tenantId } = scope;
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

  // Si mientras tanto desconectaron o reconectaron, estas escrituras no pisan la fila nueva.
  const accountWhere = { tenantId, refreshTokenEnc };

  let refreshToken: string;
  try {
    const key = loadIntegrationTokenKey(env);
    refreshToken = openSecret(refreshTokenEnc, key, GOOGLE_SECRET_AAD.refreshToken(tenantId));
  } catch {
    await prisma.googleCalendarAccount.updateMany({
      where: accountWhere,
      data: { syncError: DECRYPT_FAILED_MESSAGE, syncErrorAt: nowFn() },
    });
    return { processed: 0, error: "decrypt_failed" };
  }

  const events = (deps.events ?? defaultEvents(env))(refreshToken);
  const calendarId = account.calendarId || "primary";
  let processed = 0;

  try {
    for (const appt of pending) {
      const where = { id: appt.id, ...appointmentScope };
      if (appt.status === "CONFIRMED" && !appt.googleEventId) {
        const res = await events.insert({
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
        let gone = false;
        try {
          await events.patch({
            calendarId,
            eventId: appt.googleEventId,
            requestBody: {
              start: { dateTime: appt.startsAt.toISOString(), timeZone: pro.timezone },
              end: { dateTime: appt.endsAt.toISOString(), timeZone: pro.timezone },
            },
          });
        } catch (err: unknown) {
          // 404/410: el evento ya no existe (lo borraron en Google). Se recrea en el próximo tick.
          const status = errorStatus(err);
          if (status !== 404 && status !== 410) throw err;
          gone = true;
        }
        await prisma.appointment.update({
          where,
          data: gone ? { googleEventId: null, needsGoogleSync: true } : { needsGoogleSync: false },
        });
      } else if (appt.status !== "CONFIRMED" && appt.googleEventId) {
        try {
          await events.delete({ calendarId, eventId: appt.googleEventId });
        } catch (err: unknown) {
          // 404/410: el evento ya no existe, lo damos por sincronizado.
          const status = errorStatus(err);
          if (status !== 404 && status !== 410) throw err;
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

    if (account.syncError) {
      await prisma.googleCalendarAccount.updateMany({
        where: accountWhere,
        data: { syncError: null, syncErrorAt: null },
      });
    }
    return { processed };
  } catch (err) {
    const message = describeGoogleCalendarError(err);
    await prisma.googleCalendarAccount.updateMany({
      where: accountWhere,
      data: { syncError: message, syncErrorAt: nowFn() },
    });
    return { processed, error: message };
  }
}
