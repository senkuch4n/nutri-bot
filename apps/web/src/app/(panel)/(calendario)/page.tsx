import { prisma } from "@nutri-bot/db";
import {
  countAgendaDay,
  formatInTimeZone,
  fromZonedTime,
  nextAppointmentText,
  todaySummaryText,
  weekSummaryText,
} from "@nutri-bot/core";
import { getProfessional } from "@/lib/professional";
import { listServices } from "@/lib/services";
import { CalendarClient } from "../calendar-client";

export const dynamic = "force-dynamic";

/** Estados que cuentan en el resumen (D8): CANCELLED y AWAITING_PAYMENT no. */
const COUNTED = ["CONFIRMED", "COMPLETED", "NO_SHOW"] as const;

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
function hhmmss(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, min));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}:00`;
}

/**
 * HU-017b-1 (SDD 4.5). `?fecha=` y `?vista=` los lee el cliente desde la URL (Q3): así el "Atrás" de
 * Next, que puede restaurar las props del render original, no lleva a otro día.
 */
export default async function CalendarPage() {
  const pro = await getProfessional();
  const tz = pro.timezone;
  const now = new Date();

  const todayKey = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const todayStart = fromZonedTime(`${todayKey}T00:00:00`, tz);
  const todayEnd = fromZonedTime(`${todayKey}T23:59:59.999`, tz);
  const isoDow = Number(formatInTimeZone(now, tz, "i")); // 1 = lunes … 7 = domingo
  const weekStartKey = formatInTimeZone(new Date(now.getTime() - (isoDow - 1) * 86_400_000), tz, "yyyy-MM-dd");
  const weekStart = fromZonedTime(`${weekStartKey}T00:00:00`, tz);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);

  const [services, rules, todayAppts, weekCount, nextAppt] = await Promise.all([
    listServices({ activeOnly: true }),
    prisma.availabilityRule.findMany({ where: { active: true } }),
    prisma.appointment.findMany({
      where: { status: { in: [...COUNTED] }, startsAt: { gte: todayStart, lte: todayEnd } },
      select: { status: true, startsAt: true },
    }),
    prisma.appointment.count({
      where: { status: { in: [...COUNTED] }, startsAt: { gte: weekStart, lt: weekEnd } },
    }),
    prisma.appointment.findFirst({
      where: { status: "CONFIRMED", startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      include: { patient: true, service: true },
    }),
  ]);

  const businessHours = rules.map((r) => ({
    daysOfWeek: [r.weekday],
    startTime: r.startTime,
    endTime: r.endTime,
  }));

  const starts = rules.map((r) => toMin(r.startTime));
  const ends = rules.map((r) => toMin(r.endTime));
  const slotMin = starts.length ? hhmmss(Math.floor(Math.min(...starts) / 60) * 60 - 60) : "08:00:00";
  const slotMax = ends.length ? hhmmss(Math.ceil(Math.max(...ends) / 60) * 60 + 60) : "20:00:00";

  const summary = {
    todayText: todaySummaryText(countAgendaDay(todayAppts, now)),
    weekText: weekSummaryText(weekCount),
    nextText: nextAppt
      ? nextAppointmentText(
          { startsAt: nextAppt.startsAt, patient: nextAppt.patient, serviceName: nextAppt.service.name },
          now,
          tz,
        )
      : null,
  };

  return (
    <CalendarClient
      tz={tz}
      currency={pro.currency}
      todayKey={todayKey}
      services={services.map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin }))}
      legend={services.map((s) => ({ name: s.name, color: s.color }))}
      summary={summary}
      businessHours={businessHours}
      slotMin={slotMin}
      slotMax={slotMax}
    />
  );
}
