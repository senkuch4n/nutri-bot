// HU-017b-1 (SDD 4.2). Textos de la agenda: cómo se llama cada turno en el calendario, la franja de
// resumen en palabras, el título del período y los textos del panel del turno y de "Nuevo turno".
// Todo en la zona horaria que se pasa (o a partir de dayKeys), nunca en la del proceso.
import { es as esLocale } from "date-fns/locale";
import type { AppointmentStatusLike } from "./patient-summary";
import { formatPhone } from "./phone-format";
import { capitalizeFirst, formatAppointmentWhen } from "./relative-date";
import { dayKeyInTz, formatInTimeZone } from "./time";
import { classifyWhatsappJid } from "./whatsapp-contact";

export type CalendarView = "dia" | "semana" | "mes";

type PatientLike = { name: string | null; phone: string; whatsappJid: string };

const UNNAMED = "Sin nombre";

/** Nombre a mostrar de una paciente: name recortado; si no tiene (null o solo espacios) y el JID es
 *  "phone" → formatPhone(phone); si no ("hidden", "not_person") → "Sin nombre". */
export function patientDisplayName(p: PatientLike): string {
  const name = p.name?.trim();
  if (name) return name;
  return classifyWhatsappJid(p.whatsappJid) === "phone" ? formatPhone(p.phone) : UNNAMED;
}

/** "Brenda Yebara · Control", "+54 9 351 555-2345 · Control", "Sin nombre · Control". */
export function appointmentEventTitle(p: PatientLike, serviceName: string): string {
  return `${patientDisplayName(p)} · ${serviceName}`;
}

/** Primera palabra del nombre recortado ("María José Gómez" → "María"); null si no hay nombre. */
export function firstName(name: string | null): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

function dayPhrase(startsAt: Date, now: Date, tz: string): string {
  const sameYear = dayKeyInTz(startsAt, tz).slice(0, 4) === dayKeyInTz(now, tz).slice(0, 4);
  const pattern = sameYear ? "EEEE d 'de' MMMM" : "EEEE d 'de' MMMM 'de' yyyy";
  return formatInTimeZone(startsAt, tz, pattern, { locale: esLocale });
}

/** "jueves 8 de octubre, 10:00" (minúscula, para el medio de una frase; hora "H:mm").
 *  Si el año del turno no es el de `now` (en tz): "lunes 4 de enero de 2027, 9:00". */
export function appointmentDayTime(startsAt: Date, now: Date, tz: string): string {
  return `${dayPhrase(startsAt, now, tz)}, ${formatInTimeZone(startsAt, tz, "H:mm")}`;
}

/** "jueves 8 de octubre a las 10:00"; con la hora 1 → "a la 1:30"; mismo criterio de año. */
export function appointmentDayAtTime(startsAt: Date, now: Date, tz: string): string {
  const time = formatInTimeZone(startsAt, tz, "H:mm");
  const article = time.startsWith("1:") ? "a la" : "a las";
  return `${dayPhrase(startsAt, now, tz)} ${article} ${time}`;
}

export interface AgendaDayCount {
  total: number;
  remaining: number;
}

/** total = CONFIRMED + COMPLETED + NO_SHOW; remaining = CONFIRMED con startsAt > now.
 *  CANCELLED y AWAITING_PAYMENT no cuentan. (D8) */
export function countAgendaDay(
  appts: readonly { status: AppointmentStatusLike; startsAt: Date }[],
  now: Date,
): AgendaDayCount {
  let total = 0;
  let remaining = 0;
  for (const a of appts) {
    if (a.status !== "CONFIRMED" && a.status !== "COMPLETED" && a.status !== "NO_SHOW") continue;
    total += 1;
    if (a.status === "CONFIRMED" && a.startsAt.getTime() > now.getTime()) remaining += 1;
  }
  return { total, remaining };
}

function turnos(n: number): string {
  return n === 1 ? "1 turno" : `${n} turnos`;
}

/** "Hoy: 6 turnos · queda 1" · "Hoy: 6 turnos · quedan 2" · "Hoy: 6 turnos · no queda ninguno" ·
 *  "Hoy: 1 turno · queda 1" · total 0 → "Hoy: sin turnos". (Q11) */
export function todaySummaryText(c: AgendaDayCount): string {
  if (c.total === 0) return "Hoy: sin turnos";
  const rest =
    c.remaining === 0 ? "no queda ninguno" : c.remaining === 1 ? "queda 1" : `quedan ${c.remaining}`;
  return `Hoy: ${turnos(c.total)} · ${rest}`;
}

/** "Esta semana: 18 turnos" · "Esta semana: 1 turno" · "Esta semana: sin turnos". */
export function weekSummaryText(total: number): string {
  return total === 0 ? "Esta semana: sin turnos" : `Esta semana: ${turnos(total)}`;
}

/** "Hoy, 16:30 · Brenda Yebara · Control" (formatAppointmentWhen + patientDisplayName + servicio). */
export function nextAppointmentText(
  a: { startsAt: Date; patient: PatientLike; serviceName: string },
  now: Date,
  tz: string,
): string {
  return `${formatAppointmentWhen(a.startsAt, now, tz)} · ${patientDisplayName(a.patient)} · ${a.serviceName}`;
}

// ─── Título del período (a partir de dayKeys, sin la zona del proceso) ─────────────────────────────

function keyToUtcDate(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

function fmtKey(dayKey: string, pattern: string): string {
  return formatInTimeZone(keyToUtcDate(dayKey), "UTC", pattern, { locale: esLocale });
}

function previousKey(dayKey: string): string {
  const date = keyToUtcDate(dayKey);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Título del período, a partir de dayKeys de la zona del calendario (sin depender de la zona del
 *  proceso). endKeyExclusive = el día siguiente al último visible del período (view.currentEnd).
 *  - dia: "Jueves 8 de octubre"; otro año que todayKey: "Lunes 4 de enero de 2027".
 *  - semana: mismo mes "5 – 11 de octubre"; meses distintos "28 de septiembre – 4 de octubre";
 *    años distintos "28 de diciembre de 2026 – 3 de enero de 2027"; los dos en un año que no es el de
 *    todayKey: "5 – 11 de octubre de 2027". Separador " – " (raya corta con espacios).
 *  - mes: "Octubre 2026" (siempre con año). */
export function calendarPeriodTitle(
  view: CalendarView,
  startKey: string,
  endKeyExclusive: string,
  todayKey: string,
): string {
  const todayYear = todayKey.slice(0, 4);
  if (view === "mes") return capitalizeFirst(fmtKey(startKey, "MMMM yyyy"));
  if (view === "dia") {
    const pattern = startKey.slice(0, 4) === todayYear ? "EEEE d 'de' MMMM" : "EEEE d 'de' MMMM 'de' yyyy";
    return capitalizeFirst(fmtKey(startKey, pattern));
  }
  const endKey = previousKey(endKeyExclusive);
  const startYear = startKey.slice(0, 4);
  const endYear = endKey.slice(0, 4);
  if (startYear !== endYear) {
    return `${fmtKey(startKey, "d 'de' MMMM 'de' yyyy")} – ${fmtKey(endKey, "d 'de' MMMM 'de' yyyy")}`;
  }
  const yearSuffix = startYear === todayYear ? "" : ` de ${startYear}`;
  if (startKey.slice(5, 7) === endKey.slice(5, 7)) {
    return `${fmtKey(startKey, "d")} – ${fmtKey(endKey, "d 'de' MMMM")}${yearSuffix}`;
  }
  return `${fmtKey(startKey, "d 'de' MMMM")} – ${fmtKey(endKey, "d 'de' MMMM")}${yearSuffix}`;
}

const NAV_LABELS: Record<CalendarView, { prev: string; next: string }> = {
  dia: { prev: "Día anterior", next: "Día siguiente" },
  semana: { prev: "Semana anterior", next: "Semana siguiente" },
  mes: { prev: "Mes anterior", next: "Mes siguiente" },
};

/** Nombres accesibles de ‹ ›: dia → "Día anterior"/"Día siguiente"; semana → "Semana anterior"/
 *  "Semana siguiente"; mes → "Mes anterior"/"Mes siguiente". */
export function calendarNavLabels(view: CalendarView): { prev: string; next: string } {
  return NAV_LABELS[view];
}

/** Textos exactos del calendario, el panel del turno y "Nuevo turno" (solo panel). */
export const AGENDA_TEXT = {
  views: { dia: "Día", semana: "Semana", mes: "Mes" } as Record<CalendarView, string>,
  today: "Hoy",
  viewSelectorLabel: "Vista del calendario",
  next: "Próximo",
  noNext: "Sin turnos próximos",
  legendServices: "Servicios",
  legendStates: "Estados",
  loading: "Cargando turnos",
  loadError: "No se pudieron cargar los turnos.",
  sheet: {
    seeProfile: "Ver ficha",
    whatsapp: "WhatsApp",
    completed: "Vino a la consulta",
    noShow: "No vino",
    backToConfirmed: "Volver a confirmado",
    openConsultation: "Abrir la consulta",
    sendReminder: "Enviar recordatorio",
    registerPayment: "Registrar pago",
    editReason: "Editar motivo",
    noReason: "Sin motivo",
    price: "Precio",
    reason: "Motivo",
    reminders: "Recordatorios",
    pastAppointment: "Turno pasado",
    inGoogle: "En Google Calendar",
    cancel: "Cancelar turno",
    cancelHint: "Le avisamos por WhatsApp.",
    toastCompletedCreated: "Listo. Se creó su consulta.",
    toastCompleted: "Listo.",
    toastNoShow: "Marcado: no vino",
    toastBackToConfirmed: "Volvió a confirmado",
    toastReminderQueued: "Recordatorio en camino",
    toastReminderPending: "Ya hay un recordatorio por salir",
    toastReasonSaved: "Motivo guardado",
    backToConfirmedTitle: "¿Volver el turno a confirmado?", // se conserva el texto de HU-003 (D3)
  },
  cancel: {
    title: (patient: string) => `¿Cancelar el turno de ${patient}?`,
    /** when = appointmentDayAtTime. */
    description: (when: string) => `Le avisamos por WhatsApp que se canceló el turno del ${when}.`,
    confirm: "Cancelar turno",
    back: "Volver",
    scheduled: (first: string | null) =>
      first
        ? `Turno cancelado. Le avisamos a ${first} en unos segundos.`
        : "Turno cancelado. Le avisamos en unos segundos.",
    undone: "Listo, el turno sigue en pie",
    error: "No se pudo cancelar el turno. Probá de nuevo.",
  },
  create: {
    title: "Nuevo turno",
    who: "¿Para quién?",
    searchLabel: "Buscar paciente por nombre o teléfono",
    searchPlaceholder: "Buscá por nombre o teléfono",
    noResults: (q: string) => `No encontramos a «${q}»`,
    newPatient: "Paciente nueva",
    change: "Cambiar",
    nameLabel: "Nombre y apellido",
    phoneLabel: "WhatsApp",
    nameRequired: "Escribí el nombre",
    existing: (name: string) => `Ese número es de ${name}`,
    chooseExisting: (first: string) => `Elegir a ${first}`,
    service: "Servicio",
    servicePlaceholder: "Elegí un servicio",
    day: "Día",
    tomorrow: "Mañana",
    time: "Horario",
    pickServiceFirst: "Elegí un servicio para ver los horarios.",
    loadingSlots: "Buscando horarios…",
    noSlots: "No hay horarios libres ese día.",
    slotNotFree: (hhmm: string, service: string) =>
      `A las ${hhmm} no hay lugar para ${service}. Elegí otro horario.`,
    choosePatient: "Elegí para quién es",
    chooseTime: "Elegí un horario",
    reasonLabel: "Motivo (opcional)",
    reasonHint: "No se le manda a la paciente.",
    whatsappNotice: "Le mandamos la confirmación por WhatsApp.",
    submit: "Crear turno",
    submitting: "Creando…",
    cancel: "Cancelar",
    /** when = appointmentDayTime. */
    created: (patient: string, when: string) => `Turno creado para ${patient}, ${when}`,
    slotGone: "Ese horario se ocupó recién. Elegí otro.",
    patientGone: "Esa paciente ya no está. Elegila de nuevo.",
    serviceRequired: "Elegí un servicio",
    genericError: "No se pudo crear el turno. Probá de nuevo.",
  },
} as const;
