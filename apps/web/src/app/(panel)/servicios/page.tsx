import { Tag } from "lucide-react";
import { formatPrice, parseServiceReminders, serviceSummaryLine } from "@nutri-bot/core";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { listServices } from "@/lib/services";
import { NewServiceButton } from "./new-service-button";
import { ServiceSections, type ServiceView } from "./service-card";

export const dynamic = "force-dynamic";

export default async function ServiciosPage() {
  const [pro, services] = await Promise.all([getProfessional(), listServices()]);

  // Solo datos planos al cliente (T9a): textos ya armados, nada de funciones ni componentes.
  const views: ServiceView[] = services.map((s) => {
    const reminders = parseServiceReminders(s.reminders);
    const depositValue = s.depositValue?.toString() ?? null;
    return {
      priceLabel: formatPrice(s.price.toString(), pro.currency),
      summary: serviceSummaryLine(
        {
          requiresDeposit: s.requiresDeposit,
          depositKind: s.depositKind,
          depositValue: depositValue === null ? null : Number(depositValue),
          prepInstructions: s.prepInstructions,
          asksReason: s.asksReason,
          reminders,
        },
        pro.currency,
      ),
      service: {
        id: s.id,
        name: s.name,
        description: s.description,
        price: s.price.toString(),
        durationMin: s.durationMin,
        color: s.color,
        active: s.active,
        requiresDeposit: s.requiresDeposit,
        depositKind: s.depositKind,
        depositValue,
        prepInstructions: s.prepInstructions,
        prepLeadHours: s.prepLeadHours,
        asksReason: s.asksReason,
        reminders,
      },
    };
  });

  return (
    <div>
      <PageHeader
        title="Servicios"
        description="Lo que el bot les ofrece a tus pacientes."
        action={<NewServiceButton currency={pro.currency} />}
      />

      {views.length === 0 ? (
        <Card>
          <EmptyState
            icon={Tag}
            title="Todavía no hay servicios"
            description="Cargá el primero para que el bot pueda ofrecerlo."
            action={<NewServiceButton currency={pro.currency} label="Crear el primer servicio" variant="tinted" />}
          />
        </Card>
      ) : (
        <ServiceSections services={views} currency={pro.currency} />
      )}
    </div>
  );
}
