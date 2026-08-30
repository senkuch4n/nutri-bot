import { formatPrice } from "@nutri-bot/core";
import { PageHeader, SectionLabel } from "@/components/ui";
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
    },
  });

  return (
    <div className="space-y-10">
      <PageHeader
        title="Servicios"
        description="Consultas, estudios y precios que ofrecés. El bot los muestra a los pacientes."
        action={<NewServiceButton />}
      />

      {services.length === 0 ? (
        <div className="flex flex-col items-center gap-4 border border-dashed border-line bg-paper px-6 py-16 text-center">
          <p className="max-w-xs text-sm text-ink-soft">
            Todavía no cargaste ningún servicio. Cargá el primero para que el bot pueda ofrecerlo.
          </p>
          <NewServiceButton label="Crear el primer servicio" />
        </div>
      ) : (
        <>
          <section>
            <SectionLabel>Activos ({active.length})</SectionLabel>
            {active.length === 0 ? (
              <p className="text-sm text-ink-faint">No hay servicios activos.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {active.map((s) => (
                  <ServiceCard key={s.id} {...toView(s)} />
                ))}
              </div>
            )}
          </section>

          {inactive.length > 0 ? (
            <section>
              <SectionLabel>Inactivos ({inactive.length})</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
