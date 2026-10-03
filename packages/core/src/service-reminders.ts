import { dayKeyInTz, formatInTimeZone, hhmmToMinutes, wallTimeToUtc } from "./time";

/**
 * HU-014: recordatorios por servicio. Lógica pura (sin base ni red): validación de la lista que se
 * guarda en `Service.reminders`, momento de cada recordatorio, qué hay que encolar ahora y textos.
 */

export type ReminderUnit = "HOURS" | "DAYS";

/** Un recordatorio de la lista de un servicio (forma de cada elemento de `Service.reminders`). */
export interface ServiceReminder {
  amount: number; // entero ≥ 1
  unit: ReminderUnit;
  asksConfirmation: boolean; // true = manda el pedido de confirmación (sí/no) en vez del recordatorio
}

export const SERVICE_REMINDERS_MAX = 3;
export const REMINDER_MIN_HOURS = 1;
export const REMINDER_MAX_HOURS = 336; // 14 días
/** Un recordatorio se considera "a tiempo" hasta 15 min después de su momento (cron cada 5 min). */
export const REMINDER_ON_TIME_TOLERANCE_MS = 15 * 60_000;
/** D5: un recordatorio atrasado (bot caído) solo sale si al turno le faltan MÁS de 2 h. */
export const REMINDER_LATE_MIN_REMAINING_MS = 2 * 3_600_000;
/** D6: franja fija para los recordatorios en días (no es la de la HU-011). */
export const REMINDER_QUIET_START = "22:00";
export const REMINDER_QUIET_END = "09:00";
/** Lo que reciben hoy todos los turnos. Default del form de servicio nuevo y de la columna. */
export const DEFAULT_SERVICE_REMINDERS: readonly ServiceReminder[] = [
  { amount: 3, unit: "DAYS", asksConfirmation: true },
  { amount: 24, unit: "HOURS", asksConfirmation: false },
];

export const SERVICE_REMINDERS_TEXT = {
  tooMany: "Hasta 3 recordatorios por servicio.",
  outOfRange: "Entre 1 hora y 14 días.",
  duplicate: "Ya hay un recordatorio con esa anticipación.",
  notInteger: "Ingresá un número entero.",
  oneConfirmation: "Solo un recordatorio puede pedir confirmación.",
  invalid: "Los recordatorios no tienen un formato válido.",
} as const;

export interface ServiceReminderError {
  /** Índice de la fila (en el orden recibido); null = error de la lista entera. */
  index: number | null;
  message: string;
}

const HOUR_MS = 3_600_000;

/** Anticipación en horas: DAYS → amount × 24. */
export function reminderLeadInHours(r: Pick<ServiceReminder, "amount" | "unit">): number {
  return r.unit === "DAYS" ? r.amount * 24 : r.amount;
}

/** Clave del recordatorio automático en OutboundMessage.dedupeKey: `auto:${reminderLeadInHours(r)}h`. */
export function reminderDedupeKey(r: Pick<ServiceReminder, "amount" | "unit">): string {
  return `auto:${reminderLeadInHours(r)}h`;
}

/** Copia ordenada de mayor a menor anticipación (empate imposible en una lista válida). */
export function sortServiceReminders(list: readonly ServiceReminder[]): ServiceReminder[] {
  return [...list].sort((a, b) => reminderLeadInHours(b) - reminderLeadInHours(a));
}

/** Valida una fila sola. Devuelve la fila normalizada o el mensaje de error. */
function validateRow(row: unknown): { ok: true; reminder: ServiceReminder } | { ok: false; message: string } {
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    return { ok: false, message: SERVICE_REMINDERS_TEXT.invalid };
  }
  const { amount, unit, asksConfirmation } = row as Record<string, unknown>;
  if ((unit !== "HOURS" && unit !== "DAYS") || typeof asksConfirmation !== "boolean") {
    return { ok: false, message: SERVICE_REMINDERS_TEXT.invalid };
  }
  if (typeof amount !== "number" || !Number.isInteger(amount)) {
    return { ok: false, message: SERVICE_REMINDERS_TEXT.notInteger };
  }
  const lead = reminderLeadInHours({ amount, unit });
  if (lead < REMINDER_MIN_HOURS || lead > REMINDER_MAX_HOURS) {
    return { ok: false, message: SERVICE_REMINDERS_TEXT.outOfRange };
  }
  return { ok: true, reminder: { amount, unit, asksConfirmation } };
}

/**
 * Valida lo que manda el form (`unknown`: viene de JSON.parse). Reglas, en este orden:
 * 1. No es un array → [{ index: null, invalid }].
 * 2. Más de 3 elementos → [{ index: null, tooMany }] (no sigue).
 * 3. Por fila: forma inválida → invalid; `amount` no entero → notInteger; fuera de 1 h–14 días → outOfRange.
 * 4. Entre filas válidas: misma anticipación que una anterior → duplicate (en la posterior); una
 *    segunda con asksConfirmation → oneConfirmation (en la posterior).
 * ok → `reminders` normalizados y ordenados de mayor a menor anticipación. La lista vacía es válida.
 */
export function validateServiceReminders(
  input: unknown,
): { ok: true; reminders: ServiceReminder[] } | { ok: false; errors: ServiceReminderError[] } {
  if (!Array.isArray(input)) {
    return { ok: false, errors: [{ index: null, message: SERVICE_REMINDERS_TEXT.invalid }] };
  }
  if (input.length > SERVICE_REMINDERS_MAX) {
    return { ok: false, errors: [{ index: null, message: SERVICE_REMINDERS_TEXT.tooMany }] };
  }
  const errors: ServiceReminderError[] = [];
  const valid: ServiceReminder[] = [];
  const seenLeads = new Set<number>();
  let confirmationSeen = false;
  input.forEach((row, index) => {
    const r = validateRow(row);
    if (!r.ok) {
      errors.push({ index, message: r.message });
      return;
    }
    const lead = reminderLeadInHours(r.reminder);
    if (seenLeads.has(lead)) {
      errors.push({ index, message: SERVICE_REMINDERS_TEXT.duplicate });
      return;
    }
    seenLeads.add(lead);
    if (r.reminder.asksConfirmation) {
      if (confirmationSeen) {
        errors.push({ index, message: SERVICE_REMINDERS_TEXT.oneConfirmation });
        return;
      }
      confirmationSeen = true;
    }
    valid.push(r.reminder);
  });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, reminders: sortServiceReminders(valid) };
}

/**
 * Lectura tolerante de `Service.reminders` (Json de Prisma). Nunca tira: si `validateServiceReminders`
 * da ok devuelve eso; si no, se queda con las filas individualmente válidas, descarta duplicados por
 * anticipación (la primera gana), deja asksConfirmation solo en la primera que lo tenga, recorta a 3
 * y ordena. No array → [].
 */
export function parseServiceReminders(json: unknown): ServiceReminder[] {
  const strict = validateServiceReminders(json);
  if (strict.ok) return strict.reminders;
  if (!Array.isArray(json)) return [];
  const out: ServiceReminder[] = [];
  const seenLeads = new Set<number>();
  let confirmationSeen = false;
  for (const row of json) {
    const r = validateRow(row);
    if (!r.ok) continue;
    const lead = reminderLeadInHours(r.reminder);
    if (seenLeads.has(lead)) continue;
    seenLeads.add(lead);
    const asksConfirmation = r.reminder.asksConfirmation && !confirmationSeen;
    if (asksConfirmation) confirmationSeen = true;
    out.push({ ...r.reminder, asksConfirmation });
  }
  return sortServiceReminders(out.slice(0, SERVICE_REMINDERS_MAX));
}

/** Resta `days` días calendario a un "yyyy-MM-dd" (aritmética de fechas, sin zona). */
function shiftDayKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d! - days));
  return utc.toISOString().slice(0, 10);
}

/** Días calendario entre dos "yyyy-MM-dd" (b − a). */
function dayKeyDiff(a: string, b: string): number {
  const toUtc = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/**
 * Momento del recordatorio para un turno, en UTC:
 * - HOURS: startsAt − amount h exactas.
 * - DAYS: misma hora de pared que el turno, `amount` días calendario antes, en `tz` (respeta cambios
 *   de horario). Si esa hora de pared es ≥ 22:00 o < 09:00, se corre a las 09:00 del MISMO día
 *   calendario (D6).
 */
export function reminderMoment(startsAt: Date, r: ServiceReminder, tz: string): Date {
  if (r.unit === "HOURS") return new Date(startsAt.getTime() - r.amount * HOUR_MS);
  const day = shiftDayKey(dayKeyInTz(startsAt, tz), r.amount);
  const hhmm = formatInTimeZone(startsAt, tz, "HH:mm");
  const minutes = hhmmToMinutes(hhmm);
  const quiet = minutes >= hhmmToMinutes(REMINDER_QUIET_START) || minutes < hhmmToMinutes(REMINDER_QUIET_END);
  return wallTimeToUtc(day, quiet ? REMINDER_QUIET_END : hhmm, tz);
}

export interface SentReminders {
  /** dedupeKey de los REMINDER automáticos ya encolados del turno (cualquier status). */
  autoKeys: ReadonlySet<string>;
  /** Hay un CONFIRMATION_REQUEST del turno o confirmationRequestedAt no es null. */
  confirmationSent: boolean;
  /**
   * SDD §15: cuándo se encoló cada mensaje AUTOMÁTICO del turno (createdAt de los REMINDER `auto:*`
   * y de los CONFIRMATION_REQUEST, más `confirmationRequestedAt`). Los manuales no van. Un
   * recordatorio cuyo momento es ≤ alguno de estos instantes ya quedó cubierto (p. ej. la
   * profesional cambió la config después de que salió el aviso).
   */
  autoSentAt: readonly Date[];
}

export interface DueReminder {
  reminder: ServiceReminder;
  moment: Date;
  /** reminderDedupeKey(reminder) (también para el que pide confirmar; solo informativo en ese caso). */
  key: string;
}

/**
 * ¿Qué recordatorio hay que encolar AHORA para este turno? (null = ninguno).
 * 1. startsAt ≤ now → null.
 * 2. Candidatos = moment ≤ now y moment ≥ bookedAt.
 * 3. Sin candidatos → null.
 * 4. Elegido = el de moment más tardío (empate: menor anticipación). Los anteriores quedan superados.
 * 5. Ya enviado (su clave / la confirmación) o cubierto: algún mensaje automático del turno se
 *    encoló en o después de su momento (SDD §15) → null.
 * 6. Atrasado más que la tolerancia y faltan ≤ 2 h → null.
 * 7. → elegido.
 */
export function pickDueReminder(p: {
  startsAt: Date;
  bookedAt: Date;
  reminders: readonly ServiceReminder[];
  tz: string;
  now: Date;
  sent: SentReminders;
}): DueReminder | null {
  const now = p.now.getTime();
  const starts = p.startsAt.getTime();
  if (starts <= now) return null;
  let chosen: DueReminder | null = null;
  for (const reminder of p.reminders) {
    const moment = reminderMoment(p.startsAt, reminder, p.tz);
    const t = moment.getTime();
    if (t > now || t < p.bookedAt.getTime()) continue;
    if (
      !chosen ||
      t > chosen.moment.getTime() ||
      (t === chosen.moment.getTime() && reminderLeadInHours(reminder) < reminderLeadInHours(chosen.reminder))
    ) {
      chosen = { reminder, moment, key: reminderDedupeKey(reminder) };
    }
  }
  if (!chosen) return null;
  const alreadySent = chosen.reminder.asksConfirmation
    ? p.sent.confirmationSent
    : p.sent.autoKeys.has(chosen.key);
  if (alreadySent) return null;
  const momentMs = chosen.moment.getTime();
  const covered = p.sent.autoSentAt.some((at) => at.getTime() >= momentMs);
  if (covered) return null;
  const late = now - chosen.moment.getTime() > REMINDER_ON_TIME_TOLERANCE_MS;
  if (late && starts - now <= REMINDER_LATE_MIN_REMAINING_MS) return null;
  return chosen;
}

/**
 * Diferencia en días calendario (en `tz`) entre `now` y `startsAt`:
 * ≤ 0 → "hoy", 1 → "mañana", 2 → "pasado mañana", 7 → "en una semana", otro N → `en ${N} días`.
 */
export function relativeDayPhrase(now: Date, startsAt: Date, tz: string): string {
  const n = dayKeyDiff(dayKeyInTz(now, tz), dayKeyInTz(startsAt, tz));
  if (n <= 0) return "hoy";
  if (n === 1) return "mañana";
  if (n === 2) return "pasado mañana";
  if (n === 7) return "en una semana";
  return `en ${n} días`;
}

/** "1 día", "3 días", "1 h", "24 h" (según la unidad configurada). */
export function formatReminderLead(r: Pick<ServiceReminder, "amount" | "unit">): string {
  if (r.unit === "DAYS") return r.amount === 1 ? "1 día" : `${r.amount} días`;
  return `${r.amount} h`;
}

/** Une con comas y " y " antes del último. */
function joinEs(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}`;
}

/**
 * Badge de la tarjeta del servicio:
 * [] → "Sin recordatorios"; 1 → "Recordatorio: 7 días antes";
 * 2+ → "Recordatorios: 3 días (pide confirmar) y 24 h antes".
 */
export function serviceRemindersSummary(list: readonly ServiceReminder[]): string {
  if (list.length === 0) return "Sin recordatorios";
  const parts = sortServiceReminders(list).map(
    (r) => `${formatReminderLead(r)}${r.asksConfirmation ? " (pide confirmar)" : ""}`,
  );
  return `${parts.length === 1 ? "Recordatorio" : "Recordatorios"}: ${joinEs(parts)} antes`;
}

export type ReminderItemState = "sent" | "queued" | "failed" | "pending" | "skipped" | "not_applicable";
export interface ReminderStatusItem {
  label: string;
  state: ReminderItemState;
}

type StatusMessage = {
  kind: "REMINDER" | "CONFIRMATION_REQUEST";
  dedupeKey: string;
  status: "PENDING" | "SENT" | "FAILED";
  createdAt: Date;
};

function stateFromStatus(status: StatusMessage["status"]): ReminderItemState {
  if (status === "SENT") return "sent";
  if (status === "FAILED") return "failed";
  return "queued";
}

/** Label de un REMINDER automático cuya clave ya no está en la config ("auto:168h" → "7 días antes"). */
function labelFromAutoKey(key: string): string {
  const hours = Number(key.slice("auto:".length, -1));
  if (Number.isInteger(hours) && hours % 24 === 0 && hours >= 48) return `${hours / 24} días antes`;
  return `${hours} h antes`;
}

/** Último mensaje (por createdAt) de una lista, o undefined. */
function latest(list: StatusMessage[]): StatusMessage | undefined {
  return [...list].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}

/**
 * Estado de los recordatorios de un turno (línea del detalle, D8). Un ítem por recordatorio de la
 * config vigente, en su orden; después los REMINDER automáticos cuya clave ya no está en la config y
 * los manuales ("manual:…" o ""), en orden de createdAt.
 */
export function reminderStatusItems(p: {
  startsAt: Date;
  bookedAt: Date;
  reminders: readonly ServiceReminder[];
  tz: string;
  now: Date;
  confirmationRequestedAt: Date | null;
  messages: readonly StatusMessage[];
}): ReminderStatusItem[] {
  const reminderMsgs = p.messages.filter((m) => m.kind === "REMINDER");
  const confirmationMsgs = p.messages.filter((m) => m.kind === "CONFIRMATION_REQUEST");
  const autoMsgs = reminderMsgs.filter((m) => m.dedupeKey.startsWith("auto:"));
  const autoKeys = new Set(autoMsgs.map((m) => m.dedupeKey));
  const autoSentAt = [
    ...autoMsgs.map((m) => m.createdAt),
    ...confirmationMsgs.map((m) => m.createdAt),
    ...(p.confirmationRequestedAt ? [p.confirmationRequestedAt] : []),
  ];
  const due = pickDueReminder({
    startsAt: p.startsAt,
    bookedAt: p.bookedAt,
    reminders: p.reminders,
    tz: p.tz,
    now: p.now,
    sent: { autoKeys, confirmationSent: confirmationMsgs.length > 0 || p.confirmationRequestedAt !== null, autoSentAt },
  });

  const items: ReminderStatusItem[] = [];
  const configKeys = new Set<string>();
  for (const r of p.reminders) {
    const key = reminderDedupeKey(r);
    if (!r.asksConfirmation) configKeys.add(key);
    const label = `${formatReminderLead(r)} antes${r.asksConfirmation ? ", pide confirmar" : ""}`;
    const msg = r.asksConfirmation
      ? latest(confirmationMsgs)
      : latest(reminderMsgs.filter((m) => m.dedupeKey === key));
    let state: ReminderItemState;
    if (msg) state = stateFromStatus(msg.status);
    else if (r.asksConfirmation && p.confirmationRequestedAt !== null) state = "sent";
    else {
      const moment = reminderMoment(p.startsAt, r, p.tz);
      if (moment.getTime() < p.bookedAt.getTime()) state = "not_applicable";
      else if (due && due.reminder === r) state = "pending";
      else if (moment.getTime() > p.now.getTime()) state = "pending";
      else state = "skipped";
    }
    items.push({ label, state });
  }

  const extras = reminderMsgs
    .filter((m) =>
      m.dedupeKey.startsWith("auto:")
        ? !configKeys.has(m.dedupeKey)
        : m.dedupeKey === "" || m.dedupeKey.startsWith("manual:"),
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const m of extras) {
    items.push({
      label: m.dedupeKey.startsWith("auto:") ? labelFromAutoKey(m.dedupeKey) : "Manual",
      state: stateFromStatus(m.status),
    });
  }
  return items;
}

const STATE_TEXT: Record<ReminderItemState, string> = {
  sent: "enviado",
  queued: "en cola",
  failed: "falló el envío",
  pending: "pendiente",
  skipped: "no se envió",
  not_applicable: "no aplica, se reservó después",
};

/**
 * Texto de la línea del detalle: ítems unidos por " · ", cada uno `${label} (${estado})`.
 * Sin ítems → "Sin recordatorios".
 */
export function reminderStatusText(items: readonly ReminderStatusItem[]): string {
  if (items.length === 0) return "Sin recordatorios";
  return items.map((i) => `${i.label} (${STATE_TEXT[i.state]})`).join(" · ");
}
