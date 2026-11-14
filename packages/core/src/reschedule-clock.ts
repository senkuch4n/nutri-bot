// HU-022. Lógica del reloj de "Cambiar horario": agrupa los inicios libres de un día (ISO) por hora y
// minuto de pared en la zona de la profesional, y da la geometría de la esfera de 24 h (como el reloj
// de Android: 1–12 afuera, 13–23 y 00 adentro). Sin DOM: la UI solo dibuja lo que sale de acá.
import { es as esLocale } from "date-fns/locale";
import { capitalizeFirst } from "./relative-date";
import { formatInTimeZone } from "./time";

export interface RescheduleSlotHour {
  hour: number;
  /** Minutos libres de esa hora, ordenados, con el ISO del inicio. */
  minutes: { minute: number; iso: string }[];
}

/** Agrupa los inicios libres por hora de pared en `tz`, ordenados; un horario repetido cuenta una vez. */
export function groupRescheduleSlots(slots: readonly string[], tz: string): RescheduleSlotHour[] {
  const byHour = new Map<number, Map<number, string>>();
  for (const iso of slots) {
    const [h, m] = formatInTimeZone(new Date(iso), tz, "H:m").split(":").map(Number);
    const hour = h ?? 0;
    const minute = m ?? 0;
    const minutes = byHour.get(hour) ?? new Map<number, string>();
    if (!minutes.has(minute)) minutes.set(minute, iso);
    byHour.set(hour, minutes);
  }
  return [...byHour.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, minutes]) => ({
      hour,
      minutes: [...minutes.entries()].sort(([a], [b]) => a - b).map(([minute, iso]) => ({ minute, iso })),
    }));
}

/** ISO del horario elegido, o null si esa hora y minuto no están libres. */
export function rescheduleSlotIso(groups: readonly RescheduleSlotHour[], hour: number, minute: number): string | null {
  return groups.find((g) => g.hour === hour)?.minutes.find((m) => m.minute === minute)?.iso ?? null;
}

/** Minuto al cambiar de hora: el mismo si está libre; si no, el primero libre; null si la hora no tiene. */
export function minuteForHour(groups: readonly RescheduleSlotHour[], hour: number, preferred: number): number | null {
  const minutes = groups.find((g) => g.hour === hour)?.minutes ?? [];
  if (minutes.some((m) => m.minute === preferred)) return preferred;
  return minutes[0]?.minute ?? null;
}

/** Selección inicial: la hora actual del turno si está libre (con su minuto o el primero libre); si no,
 *  el primer horario libre del día; null si el día no tiene horarios. */
export function initialRescheduleSelection(
  groups: readonly RescheduleSlotHour[],
  currentStartIso: string,
  tz: string,
): { hour: number; minute: number } | null {
  const [h, m] = formatInTimeZone(new Date(currentStartIso), tz, "H:m").split(":").map(Number);
  const minute = minuteForHour(groups, h ?? 0, m ?? 0);
  if (minute !== null) return { hour: h ?? 0, minute };
  const first = groups[0];
  const firstMinute = first?.minutes[0];
  return first && firstMinute ? { hour: first.hour, minute: firstMinute.minute } : null;
}

export type ClockRing = "outer" | "inner";

/** Posición de una hora (0–23) en la esfera: ángulo en grados, en sentido horario desde arriba, y anillo. */
export function clockHourPosition(hour: number): { angle: number; ring: ClockRing } {
  const ring: ClockRing = hour >= 1 && hour <= 12 ? "outer" : "inner";
  return { angle: (hour % 12) * 30, ring };
}

/** Número de la hora en la esfera: la medianoche es "00". */
export function clockHourLabel(hour: number): string {
  return hour === 0 ? "00" : String(hour);
}

/** Ángulo de un minuto (0–59) en la esfera. */
export function clockMinuteAngle(minute: number): number {
  return minute * 6;
}

/** Punto a `radius` del centro para un ángulo de la esfera (y crece hacia abajo, como en la pantalla). */
export function clockPoint(angle: number, radius: number): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return { x: Math.sin(rad) * radius, y: -Math.cos(rad) * radius };
}

/** Marcas del anillo de minutos: las 12 de a 5 con número, más (sin número) los minutos libres que no
 *  caen de a 5 (p. ej. un servicio de 40 min arranca a las :20 y :40, pero uno de 7 no). */
export function rescheduleMinuteMarks(available: readonly number[]): { minute: number; labeled: boolean }[] {
  const marks = new Map<number, boolean>();
  for (let m = 0; m < 60; m += 5) marks.set(m, true);
  for (const m of available) if (!marks.has(m)) marks.set(m, false);
  return [...marks.entries()].sort(([a], [b]) => a - b).map(([minute, labeled]) => ({ minute, labeled }));
}

/** Corre un "yyyy-MM-dd" `delta` días (aritmética de calendario, sin zona horaria). */
export function shiftDayKey(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + delta)).toISOString().slice(0, 10);
}

/** "Hoy", "Mañana", "Lunes 9 de noviembre" u otro año "Lunes 4 de enero de 2027". */
export function rescheduleDayLabel(dayKey: string, todayKey: string): string {
  if (dayKey === todayKey) return "Hoy";
  if (dayKey === shiftDayKey(todayKey, 1)) return "Mañana";
  // Mediodía UTC del día calendario, leído en UTC: no se corre de día con ninguna zona.
  const noon = new Date(`${dayKey}T12:00:00.000Z`);
  const sameYear = dayKey.slice(0, 4) === todayKey.slice(0, 4);
  return capitalizeFirst(
    formatInTimeZone(noon, "UTC", sameYear ? "EEEE d 'de' MMMM" : "EEEE d 'de' MMMM 'de' yyyy", { locale: esLocale }),
  );
}

export const RESCHEDULE_TEXT = {
  title: "Cambiar horario",
  save: "Guardar",
  saving: "Guardando…",
  cancel: "Cancelar",
  noSlots: "Sin horarios libres este día",
  loading: "Buscando horarios…",
  loadError: "No se pudieron cargar los horarios.",
  saveError: "No se pudo cambiar el horario.",
  prevDay: "Día anterior",
  nextDay: "Día siguiente",
  hours: "Hora",
  minutes: "Minutos",
  /** Etiqueta accesible del botón de una hora de la esfera. */
  hourLabel: (hour: number) => `${hour} ${hour === 1 ? "hora" : "horas"}`,
  /** Etiqueta accesible del botón de un minuto de la esfera. */
  minuteLabel: (minute: number) => `Minuto ${String(minute).padStart(2, "0")}`,
  /** Botón de una fila de "Fecha y hora" que abre el modal. */
  openLabel: (when: string) => `Cambiar horario (${when})`,
  toastDone: "Turno reprogramado",
} as const;
