import { PageHeader } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { listServices } from "@/lib/services";
import { CalendarClient } from "./calendar-client";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const [pro, services] = await Promise.all([getProfessional(), listServices({ activeOnly: true })]);

  return (
    <div>
      <PageHeader title="Calendario" description="Turnos confirmados, completados y ausencias." />
      <CalendarClient
        tz={pro.timezone}
        currency={pro.currency}
        services={services.map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin }))}
      />
    </div>
  );
}
