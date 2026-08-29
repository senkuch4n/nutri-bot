import { formatPrice } from "@nutri-bot/core";
import { Card, PageHeader } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { listServices } from "@/lib/services";
import { ServiceForm } from "./service-form";
import { ServiceRow } from "./service-row";

export const dynamic = "force-dynamic";

export default async function ServiciosPage() {
  const [pro, services] = await Promise.all([getProfessional(), listServices()]);

  return (
    <div>
      <PageHeader
        title="Servicios"
        description="Consultas, estudios y precios que ofrece la profesional."
      />

      <Card className="mb-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Nuevo servicio
        </h2>
        <ServiceForm />
      </Card>

      <div className="space-y-3">
        {services.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no hay servicios cargados.</p>
        ) : (
          services.map((s) => (
            <ServiceRow
              key={s.id}
              priceLabel={formatPrice(s.price.toString(), pro.currency)}
              service={{
                id: s.id,
                name: s.name,
                description: s.description,
                price: s.price.toString(),
                durationMin: s.durationMin,
                color: s.color,
                active: s.active,
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
