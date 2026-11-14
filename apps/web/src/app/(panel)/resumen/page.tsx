import { calendarDayPanelTitle, firstName, formatInTimeZone, fromZonedTime } from "@nutri-bot/core";
import { getProfessional } from "@/lib/professional";
import { listServices } from "@/lib/services";
import { getProfessionalDisplayName } from "@/lib/shell";
import { loadTurnos } from "../turnos/data";
import { HomeClient } from "./home-client";

export const dynamic = "force-dynamic";

/** Cuántos turnos esperando la seña se listan en el Inicio (los más próximos). */
const AWAITING_LIMIT = 20;

/**
 * Inicio del panel (referencia 2026-10-31): saludo con los turnos de hoy, el estado del día, el próximo
 * turno, la lista de hoy y los turnos que esperan la seña. Todo sale de los datos que ya usa /turnos.
 */
export default async function HomePage() {
  const pro = await getProfessional();
  const tz = pro.timezone;
  const now = new Date();
  const todayKey = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const todayStart = fromZonedTime(`${todayKey}T00:00:00`, tz);
  const todayEnd = fromZonedTime(`${todayKey}T23:59:59.999`, tz);

  const [name, services, today, awaiting, next] = await Promise.all([
    getProfessionalDisplayName(),
    listServices({ activeOnly: true }),
    loadTurnos({ startsAt: { gte: todayStart, lte: todayEnd }, status: { in: ["CONFIRMED", "COMPLETED", "NO_SHOW"] } }),
    loadTurnos({ status: "AWAITING_PAYMENT", startsAt: { gte: now } }, AWAITING_LIMIT),
    loadTurnos({ status: "CONFIRMED", startsAt: { gte: now } }, 1),
  ]);

  return (
    <HomeClient
      greetingName={firstName(name)}
      todayLabel={calendarDayPanelTitle(todayKey, todayKey)}
      today={today}
      awaiting={awaiting}
      next={next[0] ?? null}
      nowISO={now.toISOString()}
      tz={tz}
      currency={pro.currency}
      todayKey={todayKey}
      services={services.map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin }))}
    />
  );
}
