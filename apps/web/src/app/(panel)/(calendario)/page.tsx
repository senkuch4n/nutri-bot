import { es } from "date-fns/locale";
import { prisma } from "@nutri-bot/db";
import { formatInTimeZone, fromZonedTime, isValidDayKey } from "@nutri-bot/core";
import { getProfessional } from "@/lib/professional";
import { listServices } from "@/lib/services";
import { CalendarClient } from "../calendar-client";

export const dynamic = "force-dynamic";

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
function hhmmss(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, min));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}:00`;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ fecha?: string | string[] }> }) {
  // HU-017c-2 (Q7): `?fecha=yyyy-MM-dd` abre el calendario en ese día (lo usa la tarjeta "Próximo turno").
  const { fecha } = await searchParams;
  const focusDate = typeof fecha === "string" && isValidDayKey(fecha) ? fecha : undefined;
  const pro = await getProfessional();
  const tz = pro.timezone;
  const now = new Date();

  const todayKey = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const todayStart = fromZonedTime(`${todayKey}T00:00:00`, tz);
  const todayEnd = fromZonedTime(`${todayKey}T23:59:59`, tz);
  const isoDow = Number(formatInTimeZone(now, tz, "i")); // 1 = lunes … 7 = domingo
  const weekStartKey = formatInTimeZone(
    new Date(now.getTime() - (isoDow - 1) * 86_400_000),
    tz,
    "yyyy-MM-dd",
  );
  const weekStart = fromZonedTime(`${weekStartKey}T00:00:00`, tz);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);

  const [services, rules, todayCount, weekCount, nextAppt] = await Promise.all([
    listServices({ activeOnly: true }),
    prisma.availabilityRule.findMany({ where: { active: true } }),
    prisma.appointment.count({
      where: { status: "CONFIRMED", startsAt: { gte: todayStart, lte: todayEnd } },
    }),
    prisma.appointment.count({
      where: { status: "CONFIRMED", startsAt: { gte: weekStart, lt: weekEnd } },
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
  const slotMin = starts.length
    ? hhmmss(Math.floor(Math.min(...starts) / 60) * 60 - 60)
    : "08:00:00";
  const slotMax = ends.length ? hhmmss(Math.ceil(Math.max(...ends) / 60) * 60 + 60) : "20:00:00";

  const next = nextAppt
    ? {
        time:
          formatInTimeZone(nextAppt.startsAt, tz, "yyyy-MM-dd") === todayKey
            ? formatInTimeZone(nextAppt.startsAt, tz, "HH:mm")
            : formatInTimeZone(nextAppt.startsAt, tz, "EEE d · HH:mm", { locale: es }),
        label: `${nextAppt.patient.name ?? nextAppt.patient.phone} · ${nextAppt.service.name}`,
      }
    : null;

  return (
    <CalendarClient
      tz={tz}
      currency={pro.currency}
      services={services.map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin }))}
      legend={services.map((s) => ({ name: s.name, color: s.color }))}
      summary={{ today: todayCount, week: weekCount, next }}
      businessHours={businessHours}
      slotMin={slotMin}
      slotMax={slotMax}
      focusDate={focusDate}
    />
  );
}
