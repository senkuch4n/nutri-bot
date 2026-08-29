import { prisma } from "@nutri-bot/db";
import { getAvailableSlotsForService, getProfessional } from "@nutri-bot/db/domain";
import { dayKeyInTz, formatInTimeZone, fromZonedTime } from "@nutri-bot/core";
import { es } from "date-fns/locale";

const HORIZON_DAYS = 21;

export function listActiveServices() {
  return prisma.service.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
}

export interface DayOption {
  dayKey: string;
  label: string;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Próximos días con al menos un horario libre para el servicio. */
export async function nextAvailableDays(serviceId: string, count = 6): Promise<DayOption[]> {
  const pro = await getProfessional();
  const from = new Date();
  const to = new Date(from.getTime() + HORIZON_DAYS * 86_400_000);
  const slots = await getAvailableSlotsForService({ serviceId, from, to });

  const seen: string[] = [];
  for (const s of slots) {
    const key = dayKeyInTz(s, pro.timezone);
    if (!seen.includes(key)) seen.push(key);
    if (seen.length >= count) break;
  }

  return seen.map((dayKey) => ({
    dayKey,
    label: capitalize(
      formatInTimeZone(new Date(`${dayKey}T12:00:00Z`), "UTC", "EEEE d 'de' MMMM", { locale: es }),
    ),
  }));
}

/** Horarios libres para un servicio en un día concreto ("yyyy-MM-dd" en tz). */
export async function slotsForDay(serviceId: string, dayKey: string): Promise<Date[]> {
  const pro = await getProfessional();
  const from = fromZonedTime(`${dayKey}T00:00:00`, pro.timezone);
  const to = fromZonedTime(`${dayKey}T23:59:59`, pro.timezone);
  return getAvailableSlotsForService({ serviceId, from, to });
}

export function cancelableAppointments(patientId: string) {
  return prisma.appointment.findMany({
    where: { patientId, status: "CONFIRMED", startsAt: { gt: new Date() } },
    include: { service: true },
    orderBy: { startsAt: "asc" },
  });
}
