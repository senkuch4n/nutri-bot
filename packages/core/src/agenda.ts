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

/** Estado del día en el Inicio: "Sin turnos", "Quedan 2", "Queda 1" o "Ya terminaste". */
export function homeDayStatus(c: AgendaDayCount): string {
  if (c.total === 0) return "Sin turnos";
  if (c.remaining === 0) return "Ya terminaste";
  return c.remaining === 1 ? "Queda 1" : `Quedan ${c.remaining}`;
}

/** Textos exactos del Inicio (panel). */
export const HOME_TEXT = {
  navLabel: "Inicio",
  greeting: (name: string | null) => (name ? `Hola ${name}` : "Hola"),
  todayYouHave: "Hoy tenés",
  todayCount: (n: number) => (n === 0 ? "Sin turnos" : turnos(n)),
  newAppointment: "Nuevo turno",
  todayLabel: "Hoy:",
  nextLabel: "Tu próximo turno:",
  todayListTitle: "Turnos de hoy",
  todayTabs: "Turnos de hoy por estado",
  pending: "Pendientes",
  done: "Completados",
  todayEmpty: "No hay turnos",
  awaitingTitle: "Esperando la seña",
  refresh: "Refrescar",
  registerDeposit: "Registrar seña",
  cancel: "Cancelar",
  depositOf: (amount: string) => `Seña: ${amount}`,
  awaitingEmpty: "No hay turnos esperando la seña.",
} as const;

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
 *  - mes: "Octubre de 2026" (siempre con año). */
export function calendarPeriodTitle(
  view: CalendarView,
  startKey: string,
  endKeyExclusive: string,
  todayKey: string,
): string {
  const todayYear = todayKey.slice(0, 4);
  if (view === "mes") return capitalizeFirst(fmtKey(startKey, "MMMM 'de' yyyy"));
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
  /** Panel del día (Mes: la casilla se agranda a un panel a la derecha). */
  dayPanel: {
    expand: "Ver el día",
    newHere: "Nuevo turno este día",
    list: "Lista",
    agenda: "Agenda",
    tabsLabel: "Vista del día",
    empty: "No hay turnos este día.",
    pendingPayment: "Cobro pendiente",
    hasNote: "Tiene nota",
  },
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
    patient: "Paciente:",
    sections: { when: "Fecha y hora", status: "Estado", finance: "Finanzas", more: "Más" },
    statusLabel: "Estado del turno",
    minutes: (n: number) => `${n} min`,
    paid: "Pagado",
    phone: "Teléfono",
    edit: "Editar",
    sendReminderShort: "Enviar",
    consultation: "Consulta",
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
    recent: "Recientes",
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

const INK = "#0a0a0a";
const WHITE = "#ffffff";

/** Luminancia relativa WCAG de un hex (#rgb o #rrggbb); null si no es un hex válido. */
function relativeLuminance(hex: string): number | null {
  const raw = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())?.[1];
  if (!raw) return null;
  const digits = raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw;
  const channel = (i: number) => {
    const c = parseInt(digits.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** Fecha corta del turno en la zona de la profesional: "5 oct 26". */
export function appointmentShortDate(startsAt: Date, tz: string): string {
  return formatInTimeZone(startsAt, tz, "d MMM yy", { locale: esLocale }).replace(".", "");
}

/** Duración del turno en minutos, entre dos ISO. */
export function appointmentDurationMinutes(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000);
}

/** Título del panel del día: "Lunes, 5 de octubre" (con el año solo si no es el de hoy). */
export function calendarDayPanelTitle(dayKey: string, todayKey: string): string {
  const pattern = dayKey.slice(0, 4) === todayKey.slice(0, 4) ? "EEEE, d 'de' MMMM" : "EEEE, d 'de' MMMM 'de' yyyy";
  return capitalizeFirst(fmtKey(dayKey, pattern));
}

/** Minutos desde la medianoche según la hora escrita en un ISO con offset ("…T08:30:00-03:00" → 510).
 *  FullCalendar con zona con nombre ya entrega la hora local de la profesional: no se convierte. */
export function minutesOfDay(iso: string): number {
  return Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
}

interface TimelineItem {
  startMin: number;
  endMin: number;
}

function hhmmssToMinutes(value: string): number {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

/** Rango de la agenda del día: la franja configurada, ampliada a horas enteras si algún turno queda afuera. */
export function dayTimelineRange(
  slotMin: string,
  slotMax: string,
  items: readonly TimelineItem[],
): { fromMin: number; toMin: number } {
  let fromMin = hhmmssToMinutes(slotMin);
  let toMin = hhmmssToMinutes(slotMax);
  for (const it of items) {
    fromMin = Math.min(fromMin, Math.floor(it.startMin / 60) * 60);
    toMin = Math.max(toMin, Math.ceil(it.endMin / 60) * 60);
  }
  return { fromMin, toMin: Math.min(toMin, 24 * 60) };
}

/** Posición de un turno en la agenda del día, en porcentaje del alto, recortada al rango. */
export function dayTimelineBlock(
  item: TimelineItem,
  range: { fromMin: number; toMin: number },
): { top: number; height: number } {
  const span = range.toMin - range.fromMin;
  const start = Math.max(item.startMin, range.fromMin);
  const end = Math.min(Math.max(item.endMin, start), range.toMin);
  return { top: ((start - range.fromMin) / span) * 100, height: ((end - start) / span) * 100 };
}

/** Filtros del calendario: qué servicios (por nombre) y estados se ocultan. Vacío = se ve todo. */
export interface CalendarFilters {
  hiddenServices: readonly string[];
  hiddenStatuses: readonly string[];
}

export function calendarFilterHides(event: { serviceName: string; status: string }, filters: CalendarFilters): boolean {
  return filters.hiddenServices.includes(event.serviceName) || filters.hiddenStatuses.includes(event.status);
}

export function calendarFilterCount(filters: CalendarFilters): number {
  return filters.hiddenServices.length + filters.hiddenStatuses.length;
}

/** Agrega el valor si no estaba o lo saca si estaba; devuelve una lista nueva. */
export function toggleCalendarFilter(list: readonly string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Texto legible sobre el color de un servicio en el calendario: blanco o casi negro, el que tenga
 *  más contraste WCAG. Un color inválido cae en blanco (el fondo de respaldo es oscuro). */
export function readableTextOn(hex: string): typeof WHITE | typeof INK {
  const l = relativeLuminance(hex);
  if (l === null) return WHITE;
  const inkL = relativeLuminance(INK) as number;
  const onWhite = 1.05 / (l + 0.05);
  const onInk = (l + 0.05) / (inkL + 0.05);
  return onWhite >= onInk ? WHITE : INK;
}
