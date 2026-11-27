import { prisma } from "@nutri-bot/db";
import { getAvailableSlotsForService, getTenantProfessional } from "@nutri-bot/db/domain";
import type { TenantRef } from "@nutri-bot/db/domain/tenantScope";
import { dayKeyInTz, formatInTimeZone, fromZonedTime } from "@nutri-bot/core";
import { es } from "date-fns/locale";
import { getConversationTenant } from "./tenant";

const HORIZON_DAYS = 21;

// HU-033 (025c): todo el flujo de reserva lee el consultorio de la conversación (scope explícito o adaptador legacy),
// nunca Professional(1) ni servicios/turnos de otro consultorio.

/** Servicios activos del consultorio de la conversación. */
export async function listActiveServices(scope?: TenantRef) {
  const { tenantId } = scope ?? await getConversationTenant();
  return prisma.service.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" } });
}

export interface DayOption {
  dayKey: string;
  label: string;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Próximos días con al menos un horario libre para el servicio. */
export async function nextAvailableDays(serviceId: string, count = 6, scope?: TenantRef): Promise<DayOption[]> {
  const tenant = scope ?? await getConversationTenant();
  const pro = await getTenantProfessional(tenant.tenantId);
  const from = new Date();
  const to = new Date(from.getTime() + HORIZON_DAYS * 86_400_000);
  const slots = await getAvailableSlotsForService(tenant, { serviceId, from, to });

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
export async function slotsForDay(serviceId: string, dayKey: string, scope?: TenantRef): Promise<Date[]> {
  const tenant = scope ?? await getConversationTenant();
  const pro = await getTenantProfessional(tenant.tenantId);
  const from = fromZonedTime(`${dayKey}T00:00:00`, pro.timezone);
  const to = fromZonedTime(`${dayKey}T23:59:59`, pro.timezone);
  return getAvailableSlotsForService(tenant, { serviceId, from, to });
}

/** Turnos confirmados y futuros del paciente en el consultorio de la conversación. */
export async function cancelableAppointments(patientId: string, scope?: TenantRef) {
  const { tenantId } = scope ?? await getConversationTenant();
  return prisma.appointment.findMany({
    where: { patientId, tenantId, status: "CONFIRMED", startsAt: { gt: new Date() } },
    include: { service: true },
    orderBy: { startsAt: "asc" },
  });
}
