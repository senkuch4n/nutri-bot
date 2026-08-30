import { es } from "date-fns/locale";
import { prisma } from "@nutri-bot/db";
import { formatInTimeZone } from "@nutri-bot/core";
import { getProfessional } from "@/lib/professional";
import { DisponibilidadView } from "./view";

export const dynamic = "force-dynamic";

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function DisponibilidadPage() {
  const pro = await getProfessional();
  const [rules, exceptions] = await Promise.all([
    prisma.availabilityRule.findMany({ orderBy: [{ weekday: "asc" }, { startTime: "asc" }] }),
    prisma.availabilityException.findMany({ orderBy: { date: "asc" } }),
  ]);

  return (
    <DisponibilidadView
      timezone={pro.timezone}
      rules={rules.map((r) => ({
        id: r.id,
        weekday: r.weekday,
        startTime: r.startTime,
        endTime: r.endTime,
      }))}
      exceptions={exceptions.map((e) => ({
        id: e.id,
        dateLabel: cap(formatInTimeZone(e.date, "UTC", "EEEE d 'de' MMMM", { locale: es })),
        blocked: e.type === "BLOCKED",
        detail:
          e.type === "BLOCKED"
            ? e.startTime
              ? `Bloqueado ${e.startTime}–${e.endTime}`
              : "Día bloqueado"
            : `Horario especial ${e.startTime}–${e.endTime}`,
        reason: e.reason,
      }))}
    />
  );
}
