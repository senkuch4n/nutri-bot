import { Tag } from "lucide-react";
import {
  MERCADOPAGO_TEXT as MP,
  formatPrice,
  parseServiceReminders,
  serviceSummaryLine,
  shouldWarnDepositWithoutMercadoPago,
} from "@nutri-bot/core";
import { getMercadoPagoConnectionView } from "@nutri-bot/db/domain";
import { Alert, ButtonLink, EmptyState } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { listServices } from "@/lib/services";
import { NewServiceButton } from "./new-service-button";
import { ServiceSections, type ServiceView } from "./service-card";

export const dynamic = "force-dynamic";

export default async function ServiciosPage() {
  const [pro, services, mp] = await Promise.all([getProfessional(), listServices(), getMercadoPagoConnectionView()]);
  // HU-023: sin cuenta de Mercado Pago "conectada", los servicios con seña no se pueden reservar por WhatsApp.
  const mercadoPagoReady = mp.status === "connected";

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
    // Acento en negro, como la ficha y el resumen (globals.css, .ink-accent).
    <div className="ink-accent">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-title-1 font-medium">Servicios</h1>
          <p className="mt-1 text-subheadline text-muted-foreground">Lo que el bot les ofrece a tus pacientes.</p>
        </div>
        <NewServiceButton currency={pro.currency} mercadoPagoReady={mercadoPagoReady} />
      </header>

      {shouldWarnDepositWithoutMercadoPago(mp) ? (
        <Alert tone="warning" title={MP.depositWarningTitle} className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>{MP.depositWarningBody}</p>
            <ButtonLink href="/ajustes?tab=mercadopago" variant="secondary">
              {MP.depositWarningAction}
            </ButtonLink>
          </div>
        </Alert>
      ) : null}

      {views.length === 0 ? (
        <div className="rounded-[1.75rem] bg-[#f6f5f8]">
          <EmptyState
            icon={Tag}
            title="Todavía no hay servicios"
            description="Cargá el primero para que el bot pueda ofrecerlo."
            action={
              <NewServiceButton
                currency={pro.currency}
                mercadoPagoReady={mercadoPagoReady}
                label="Crear el primer servicio"
                variant="tinted"
              />
            }
          />
        </div>
      ) : (
        <ServiceSections services={views} currency={pro.currency} mercadoPagoReady={mercadoPagoReady} />
      )}
    </div>
  );
}
