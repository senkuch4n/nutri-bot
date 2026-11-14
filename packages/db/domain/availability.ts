import {
  dayKeyFromDbDate,
  dayRangeUtc,
  getAvailableSlots,
  isSlotAvailable,
  isValidDayKey,
  type BusyInterval,
  type Exception,
  type Rule,
} from "@nutri-bot/core";
import { prisma, type Prisma } from "../index";
import { PROFESSIONAL_SELECT } from "./professionalSelect";

type AvailabilityClient = Pick<Prisma.TransactionClient, "professional" | "service" | "availabilityRule" | "availabilityException" | "appointment">;

function minLeadMinutes(): number {
  return Number(process.env.MIN_LEAD_MINUTES ?? 120);
}

export async function getProfessional() {
  const pro = await prisma.professional.findUnique({ where: { id: 1 }, select: PROFESSIONAL_SELECT });
  if (!pro) {
    throw new Error("Falta la ficha de la profesional. Ejecutá `npm run db:seed`.");
  }
  return pro;
}

async function loadRulesAndExceptions(tz: string, db: AvailabilityClient = prisma) {
  const [rules, exceptions] = await Promise.all([
    db.availabilityRule.findMany({ where: { active: true } }),
    db.availabilityException.findMany(),
  ]);

  const coreRules: Rule[] = rules.map((r) => ({
    weekday: r.weekday,
    startTime: r.startTime,
    endTime: r.endTime,
    active: r.active,
  }));

  const coreExceptions: Exception[] = exceptions.map((e) => ({
    dayKey: dayKeyFromDbDate(e.date),
    type: e.type,
    startTime: e.startTime,
    endTime: e.endTime,
  }));

  return { coreRules, coreExceptions };
}

async function loadBusy(
  from: Date,
  to: Date,
  excludeAppointmentId?: string,
  db: AvailabilityClient = prisma,
): Promise<BusyInterval[]> {
  const appts = await db.appointment.findMany({
    where: {
      status: { in: ["CONFIRMED", "AWAITING_PAYMENT"] },
      startsAt: { lt: to },
      endsAt: { gt: from },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
    select: { startsAt: true, endsAt: true },
  });
  return appts.map((a) => ({ start: a.startsAt, end: a.endsAt }));
}

export async function getAvailableSlotsForService(params: {
  serviceId: string;
  from: Date;
  to: Date;
  now?: Date;
  /** HU-022: turno que no cuenta como ocupado (el que se está reprogramando). */
  excludeAppointmentId?: string;
}): Promise<Date[]> {
  const now = params.now ?? new Date();
  const [pro, service] = await Promise.all([
    getProfessional(),
    prisma.service.findUnique({ where: { id: params.serviceId } }),
  ]);
  if (!service || !service.active) return [];

  const { coreRules, coreExceptions } = await loadRulesAndExceptions(pro.timezone);
  const busy = await loadBusy(params.from, params.to, params.excludeAppointmentId);

  return getAvailableSlots({
    service: { durationMin: service.durationMin },
    rules: coreRules,
    exceptions: coreExceptions,
    busy,
    from: params.from,
    to: params.to,
    now,
    tz: pro.timezone,
    minLeadMinutes: minLeadMinutes(),
  });
}

/**
 * HU-022 (S5): solo se reprograman turnos CONFIRMED o AWAITING_PAYMENT que todavía no empezaron.
 * Consumidores: getRescheduleSlots y rescheduleAppointment.
 */
export function canRescheduleAppointment(
  appt: { status: string; startsAt: Date },
  now: Date,
): boolean {
  return (appt.status === "CONFIRMED" || appt.status === "AWAITING_PAYMENT") && appt.startsAt.getTime() > now.getTime();
}

/**
 * HU-022 (S3): inicios libres del día `dayKey` ("yyyy-MM-dd" en la zona de la profesional) para el
 * servicio del turno, sin contar el propio turno como ocupado. Misma regla que la reserva:
 * disponibilidad (reglas + excepciones), otros turnos CONFIRMED/AWAITING_PAYMENT y anticipación
 * mínima. Turno inexistente o que no se puede reprogramar → []. Día inválido → tira.
 * Consumidor: web (getRescheduleSlotsAction).
 */
export async function getRescheduleSlots(params: {
  appointmentId: string;
  dayKey: string;
  now?: Date;
}): Promise<Date[]> {
  if (!isValidDayKey(params.dayKey)) throw new Error("Fecha inválida");
  const now = params.now ?? new Date();
  const appt = await prisma.appointment.findUnique({
    where: { id: params.appointmentId },
    select: { id: true, serviceId: true, status: true, startsAt: true },
  });
  if (!appt || !canRescheduleAppointment(appt, now)) return [];

  const pro = await getProfessional();
  const { start, end } = dayRangeUtc(params.dayKey, pro.timezone);
  const slots = await getAvailableSlotsForService({
    serviceId: appt.serviceId,
    from: start,
    to: end,
    now,
    excludeAppointmentId: appt.id,
  });
  // getAvailableSlots incluye `to`: la medianoche siguiente es del otro día.
  return slots.filter((s) => s < end);
}

export async function checkSlotAvailable(params: {
  serviceId: string;
  startsAt: Date;
  now?: Date;
  excludeAppointmentId?: string;
}, db: AvailabilityClient = prisma): Promise<boolean> {
  const now = params.now ?? new Date();
  const [pro, service] = await Promise.all([
    db.professional.findUniqueOrThrow({ where: { id: 1 }, select: PROFESSIONAL_SELECT }),
    db.service.findUnique({ where: { id: params.serviceId } }),
  ]);
  if (!service || !service.active) return false;

  const { coreRules, coreExceptions } = await loadRulesAndExceptions(pro.timezone, db);
  const end = new Date(params.startsAt.getTime() + service.durationMin * 60_000);
  const busy = await loadBusy(params.startsAt, end, params.excludeAppointmentId, db);

  return isSlotAvailable({
    startsAt: params.startsAt,
    service: { durationMin: service.durationMin },
    rules: coreRules,
    exceptions: coreExceptions,
    busy,
    now,
    tz: pro.timezone,
    minLeadMinutes: minLeadMinutes(),
  });
}
