import { ExternalLink, MessageCircle } from "lucide-react";
import { HIDDEN_NUMBER_TEXT, classifyWhatsappJid, formatPhone, whatsappChatUrl } from "@nutri-bot/core";
import { buttonVariants } from "@/components/primitives/button";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ClinicalAlert } from "./clinical-alert";

/** Filas 1 a 3 del encabezado persistente (server). La fila de pestañas la arma PatientTabs. */
export function PatientHeader({
  name,
  phone,
  whatsappJid,
  ageYears,
  nextAppointment,
  riskBackground,
}: {
  name: string | null;
  phone: string;
  /** HU-017c-1: define si se muestra el teléfono y el botón de WhatsApp (los @lid no tienen número). */
  whatsappJid: string;
  ageYears: number | null;
  nextAppointment: { label: string; serviceName: string; awaitingPayment: boolean } | null;
  riskBackground: string | null;
}) {
  const chatUrl = whatsappChatUrl({ whatsappJid, phone });
  const phoneLabel = classifyWhatsappJid(whatsappJid) === "phone" ? formatPhone(phone) : HIDDEN_NUMBER_TEXT;
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">
          {name ?? "Paciente sin nombre"}
        </h1>
        {chatUrl ? (
          <a
            href={chatUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
          >
            <MessageCircle aria-hidden />
            Abrir chat de WhatsApp
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        ) : null}
      </div>

      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <span>{ageYears !== null ? `${ageYears} años` : "Edad sin cargar"}</span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">{phoneLabel}</span>
        <span aria-hidden>·</span>
        {nextAppointment ? (
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              Próximo turno: {nextAppointment.label} · {nextAppointment.serviceName}
            </span>
            {nextAppointment.awaitingPayment ? <Badge tone="warning">Esperando pago</Badge> : null}
          </span>
        ) : (
          <span>Sin turnos próximos</span>
        )}
      </p>

      {riskBackground ? <ClinicalAlert background={riskBackground} compact /> : null}
    </div>
  );
}
