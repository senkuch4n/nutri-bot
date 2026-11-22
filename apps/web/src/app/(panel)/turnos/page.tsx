import { formatInTimeZone, isValidMonthKey, monthKeyInTz } from "@nutri-bot/core";
import { getTenantProfessional } from "@nutri-bot/db/domain";
import { listServices } from "@/lib/services";
import { requirePageContext } from "@/lib/tenant-context";
import { loadTurnosMonth } from "./data";
import { TurnosClient } from "./turnos-client";

export const dynamic = "force-dynamic";

/** HU-021 (T11): `?mes=yyyy-MM` válido → ese mes (también futuro); inválido o ausente → el mes en curso. */
function resolveMonth(raw: string | string[] | undefined, current: string): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && isValidMonthKey(value) ? value : current;
}

/** HU-021: lista de turnos del mes con su estado y lo registrado como pagado. */
export default async function TurnosPage({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  const ctx = await requirePageContext();
  const [pro, { mes }] = await Promise.all([getTenantProfessional(ctx.tenantId), searchParams]);
  const tz = pro.timezone;
  const now = new Date();
  const currentMonth = monthKeyInTz(now, tz);
  const month = resolveMonth(mes, currentMonth);

  const [appointments, activeServices, allServices] = await Promise.all([
    loadTurnosMonth(ctx, month, tz),
    listServices(ctx, { activeOnly: true }),
    listServices(ctx),
  ]);

  return (
    <TurnosClient
      appointments={appointments}
      month={month}
      currentMonth={currentMonth}
      nowISO={now.toISOString()}
      tz={tz}
      currency={pro.currency}
      todayKey={formatInTimeZone(now, tz, "yyyy-MM-dd")}
      services={activeServices.map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin }))}
      filterServices={allServices.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
