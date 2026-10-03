import { Tag } from "lucide-react";
import { formatPrice } from "@nutri-bot/core";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { listServices } from "@/lib/services";
import { NewServiceButton } from "./new-service-button";
import { ServiceCard } from "./service-card";

export const dynamic = "force-dynamic";

export default async function ServiciosPage() {
  const [pro, services] = await Promise.all([getProfessional(), listServices()]);
  const active = services.filter((s) => s.active);
  const inactive = services.filter((s) => !s.active);

  const toView = (s: (typeof services)[number]) => ({
    priceLabel: formatPrice(s.price.toString(), pro.currency),
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
      depositValue: s.depositValue?.toString() ?? null,
      prepInstructions: s.prepInstructions,
      prepLeadHours: s.prepLeadHours,
      asksReason: s.asksReason,
    },
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Servicios"
        description="Consultas, estudios y precios que ofrecés. El bot los muestra a los pacientes."
        action={<NewServiceButton />}
      />

      {services.length === 0 ? (
        <Card>
          <EmptyState
            icon={Tag}
            title="Todavía no hay servicios"
            description="Cargá el primero para que el bot pueda ofrecerlo."
            action={<NewServiceButton label="Crear el primer servicio" />}
          />
        </Card>
      ) : (
        <>
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
              Activos <Badge tone="neutral">{active.length}</Badge>
            </h2>
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay servicios activos.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {active.map((s) => (
                  <ServiceCard key={s.id} {...toView(s)} />
                ))}
              </div>
            )}
          </section>

          {inactive.length > 0 ? (
            <section>
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
                Inactivos <Badge tone="neutral">{inactive.length}</Badge>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {inactive.map((s) => (
                  <ServiceCard key={s.id} {...toView(s)} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
