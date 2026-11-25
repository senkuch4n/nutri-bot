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

import { resolveTenantSchedulingContext, type SchedulingContext, type TenantRef } from "./tenantScope";

type AvailabilityClient = Pick<Prisma.TransactionClient, "agenda" | "service" | "availabilityRule" | "availabilityException" | "appointment">;

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

async function loadRulesAndExceptions({ tenantId, agendaId }: SchedulingContext["scope"], db: AvailabilityClient = prisma) {
  const where = { agendaId, agenda: { tenantId } };
  const [rules, exceptions] = await Promise.all([
    db.availabilityRule.findMany({ where: { ...where, active: true } }),
    db.availabilityException.findMany({ where }),
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
  scope: SchedulingContext["scope"],
  from: Date,
  to: Date,
  excludeAppointmentId?: string,
  db: AvailabilityClient = prisma,
): Promise<BusyInterval[]> {
  const appts = await db.appointment.findMany({
    where: {
      ...scope,
      status: { in: ["CONFIRMED", "AWAITING_PAYMENT"] },
      startsAt: { lt: to },
      endsAt: { gt: from },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
    select: { startsAt: true, endsAt: true },
  });
  return appts.map((a) => ({ start: a.startsAt, end: a.endsAt }));
}

type AvailableSlotsParams = {
  serviceId: string;
  from: Date;
  to: Date;
  now?: Date;
  /** HU-022: turno que no cuenta como ocupado (el que se está reprogramando). */
  excludeAppointmentId?: string;
};

export async function getAvailableSlotsForService(t: TenantRef, params: AvailableSlotsParams): Promise<Date[]> {
  return listSlots(params, await resolveTenantSchedulingContext(prisma, t.tenantId));
}

async function listSlots(params: AvailableSlotsParams, { scope, professional: pro }: SchedulingContext) {
  const now = params.now ?? new Date();
  const service = await prisma.service.findUnique({ where: { id: params.serviceId, tenantId: scope.tenantId } });
  if (!service || !service.active) return [];

  const { coreRules, coreExceptions } = await loadRulesAndExceptions(scope);
  const busy = await loadBusy(scope, params.from, params.to, params.excludeAppointmentId);

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
export async function getRescheduleSlots(t: TenantRef, params: {
  appointmentId: string;
  dayKey: string;
  now?: Date;
}): Promise<Date[]> {
  if (!isValidDayKey(params.dayKey)) throw new Error("Fecha inválida");
  const now = params.now ?? new Date();
  const binding = await resolveTenantSchedulingContext(prisma, t.tenantId);
  const appt = await prisma.appointment.findUnique({
    where: { id: params.appointmentId, ...binding.scope },
    select: { id: true, serviceId: true, status: true, startsAt: true },
  });
  if (!appt || !canRescheduleAppointment(appt, now)) return [];

  const { start, end } = dayRangeUtc(params.dayKey, binding.professional.timezone);
  const slots = await listSlots({
    serviceId: appt.serviceId,
    from: start,
    to: end,
    now,
    excludeAppointmentId: appt.id,
  }, binding);
  // getAvailableSlots incluye `to`: la medianoche siguiente es del otro día.
  return slots.filter((s) => s < end);
}

export async function checkSlotAvailable(t: TenantRef, params: {
  serviceId: string;
  startsAt: Date;
  now?: Date;
  excludeAppointmentId?: string;
}, db: AvailabilityClient = prisma): Promise<boolean> {
  const now = params.now ?? new Date();
  const { scope, professional: pro } = await resolveTenantSchedulingContext(db, t.tenantId);
  const service = await db.service.findUnique({ where: { id: params.serviceId, tenantId: scope.tenantId } });
  if (!service || !service.active) return false;

  const { coreRules, coreExceptions } = await loadRulesAndExceptions(scope, db);
  const end = new Date(params.startsAt.getTime() + service.durationMin * 60_000);
  const busy = await loadBusy(scope, params.startsAt, end, params.excludeAppointmentId, db);

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
