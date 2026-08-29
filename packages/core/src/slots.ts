import { dayKeysBetween, hhmmToMinutes, wallTimeToUtc } from "./time";

export interface SlotService {
  durationMin: number;
}

export interface Rule {
  weekday: number; // 0..6
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  active?: boolean;
}

export type ExceptionType = "BLOCKED" | "CUSTOM_HOURS";

export interface Exception {
  /** "yyyy-MM-dd" en la zona de la profesional. */
  dayKey: string;
  type: ExceptionType;
  startTime?: string | null;
  endTime?: string | null;
}

export interface BusyInterval {
  start: Date;
  end: Date;
}

export interface SlotQuery {
  service: SlotService;
  rules: Rule[];
  exceptions: Exception[];
  busy: BusyInterval[];
  from: Date;
  to: Date;
  now: Date;
  tz: string;
  minLeadMinutes: number;
  /** Paso de la grilla en minutos. Por defecto, la duración del servicio. */
  stepMin?: number;
}

interface HourBlock {
  startMin: number;
  endMin: number;
}

/** Bloques horarios efectivos de un día concreto (reglas + excepciones). */
function blocksForDay(dayKey: string, weekday: number, rules: Rule[], exceptions: Exception[]): HourBlock[] {
  const dayExceptions = exceptions.filter((e) => e.dayKey === dayKey);

  if (dayExceptions.some((e) => e.type === "BLOCKED" && !e.startTime)) {
    return [];
  }

  const custom = dayExceptions.filter((e) => e.type === "CUSTOM_HOURS" && e.startTime && e.endTime);
  let blocks: HourBlock[] =
    custom.length > 0
      ? custom.map((e) => ({ startMin: hhmmToMinutes(e.startTime!), endMin: hhmmToMinutes(e.endTime!) }))
      : rules
          .filter((r) => r.weekday === weekday && r.active !== false)
          .map((r) => ({ startMin: hhmmToMinutes(r.startTime), endMin: hhmmToMinutes(r.endTime) }));

  // Recorta con eventuales bloqueos parciales del día.
  const partialBlocks = dayExceptions.filter((e) => e.type === "BLOCKED" && e.startTime && e.endTime);
  for (const pb of partialBlocks) {
    const bStart = hhmmToMinutes(pb.startTime!);
    const bEnd = hhmmToMinutes(pb.endTime!);
    blocks = blocks.flatMap((blk) => {
      if (bEnd <= blk.startMin || bStart >= blk.endMin) return [blk];
      const out: HourBlock[] = [];
      if (bStart > blk.startMin) out.push({ startMin: blk.startMin, endMin: bStart });
      if (bEnd < blk.endMin) out.push({ startMin: bEnd, endMin: blk.endMin });
      return out;
    });
  }

  return blocks;
}

function overlapsBusy(start: Date, end: Date, busy: BusyInterval[]): boolean {
  return busy.some((b) => start < b.end && end > b.start);
}

/**
 * Devuelve los inicios de turno disponibles (instantes UTC) para un servicio
 * en el rango [from, to], según horario semanal, excepciones y turnos ocupados.
 */
export function getAvailableSlots(q: SlotQuery): Date[] {
  const step = q.stepMin ?? q.service.durationMin;
  const durationMs = q.service.durationMin * 60_000;
  const earliest = new Date(q.now.getTime() + q.minLeadMinutes * 60_000);
  const results: Date[] = [];

  for (const dayKey of dayKeysBetween(q.from, q.to, q.tz)) {
    const blocks = blocksForDay(dayKey, weekdayOf(dayKey), q.rules, q.exceptions);

    for (const block of blocks) {
      for (let m = block.startMin; m + q.service.durationMin <= block.endMin; m += step) {
        const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        const start = wallTimeToUtc(dayKey, hhmm, q.tz);
        const end = new Date(start.getTime() + durationMs);

        if (start < q.from || start > q.to) continue;
        if (start < earliest) continue;
        if (overlapsBusy(start, end, q.busy)) continue;

        results.push(start);
      }
    }
  }

  return results.sort((a, b) => a.getTime() - b.getTime());
}

/** Día de la semana (0..6) de un "yyyy-MM-dd" tomado como fecha civil. */
function weekdayOf(dayKey: string): number {
  const [y, mo, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y!, (mo ?? 1) - 1, d ?? 1)).getUTCDay();
}

export interface SingleSlotQuery {
  startsAt: Date;
  service: SlotService;
  rules: Rule[];
  exceptions: Exception[];
  busy: BusyInterval[];
  now: Date;
  tz: string;
  minLeadMinutes: number;
}

/** Revalida un inicio de turno concreto antes de insertarlo. */
export function isSlotAvailable(q: SingleSlotQuery): boolean {
  const slots = getAvailableSlots({
    service: q.service,
    rules: q.rules,
    exceptions: q.exceptions,
    busy: q.busy,
    from: new Date(q.startsAt.getTime() - 1),
    to: new Date(q.startsAt.getTime() + 1),
    now: q.now,
    tz: q.tz,
    minLeadMinutes: q.minLeadMinutes,
    stepMin: 1,
  });
  return slots.some((s) => s.getTime() === q.startsAt.getTime());
}
