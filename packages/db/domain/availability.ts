import {
  dayKeyInTz,
  getAvailableSlots,
  isSlotAvailable,
  type BusyInterval,
  type Exception,
  type Rule,
} from "@nutri-bot/core";
import { prisma, type Prisma } from "../index";

type AvailabilityClient = Pick<Prisma.TransactionClient, "professional" | "service" | "availabilityRule" | "availabilityException" | "appointment">;

function minLeadMinutes(): number {
  return Number(process.env.MIN_LEAD_MINUTES ?? 120);
}

export async function getProfessional() {
  const pro = await prisma.professional.findUnique({ where: { id: 1 } });
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
    dayKey: dayKeyInTz(e.date, tz),
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
}): Promise<Date[]> {
  const now = params.now ?? new Date();
  const [pro, service] = await Promise.all([
    getProfessional(),
    prisma.service.findUnique({ where: { id: params.serviceId } }),
  ]);
  if (!service || !service.active) return [];

  const { coreRules, coreExceptions } = await loadRulesAndExceptions(pro.timezone);
  const busy = await loadBusy(params.from, params.to);

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

export async function checkSlotAvailable(params: {
  serviceId: string;
  startsAt: Date;
  now?: Date;
  excludeAppointmentId?: string;
}, db: AvailabilityClient = prisma): Promise<boolean> {
  const now = params.now ?? new Date();
  const [pro, service] = await Promise.all([
    db.professional.findUniqueOrThrow({ where: { id: 1 } }),
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
