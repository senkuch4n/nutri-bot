import { prisma } from "@nutri-bot/db";
import { formatInTimeZone } from "@nutri-bot/core";
import { getTenantProfessional } from "@nutri-bot/db/domain";
import { listServices } from "@/lib/services";
import { requirePageContext } from "@/lib/tenant-context";
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

/**
 * HU-017b-1 (SDD 4.5). `?fecha=` y `?vista=` los lee el cliente desde la URL (Q3): así el "Atrás" de
 * Next, que puede restaurar las props del render original, no lleva a otro día.
 */
export default async function CalendarPage() {
  // HU-025: agenda principal y profesional del consultorio de la sesión.
  const ctx = await requirePageContext();
  const { agendaId, tenantId } = ctx;

  const [{ timezone: tz, currency }, services, rules] = await Promise.all([
    getTenantProfessional(tenantId),
    listServices(ctx, { activeOnly: true }),
    prisma.availabilityRule.findMany({ where: { agendaId, agenda: { tenantId }, active: true } }),
  ]);
  const todayKey = formatInTimeZone(new Date(), tz, "yyyy-MM-dd");

  const businessHours = rules.map((r) => ({
    daysOfWeek: [r.weekday],
    startTime: r.startTime,
    endTime: r.endTime,
  }));

  const starts = rules.map((r) => toMin(r.startTime));
  const ends = rules.map((r) => toMin(r.endTime));
  const slotMin = starts.length ? hhmmss(Math.floor(Math.min(...starts) / 60) * 60 - 60) : "08:00:00";
  const slotMax = ends.length ? hhmmss(Math.ceil(Math.max(...ends) / 60) * 60 + 60) : "20:00:00";

  return (
    <CalendarClient
      tz={tz}
      currency={currency}
      todayKey={todayKey}
      services={services.map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin }))}
      legend={services.map((s) => ({ name: s.name, color: s.color }))}
      businessHours={businessHours}
      slotMin={slotMin}
      slotMax={slotMax}
    />
  );
}
