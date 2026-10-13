import { ExternalLink, MessageCircle } from "lucide-react";
import {
  HIDDEN_NUMBER_TEXT,
  PATIENT_SUMMARY_TEXT,
  classifyWhatsappJid,
  formatPhone,
  whatsappChatUrl,
} from "@nutri-bot/core";
import { buttonVariants } from "@/components/primitives/button";
import { cn } from "@/lib/utils";
import { ClinicalAlert } from "./clinical-alert";
import { HeaderNameButton } from "./header-name-button";

const T = PATIENT_SUMMARY_TEXT;

/** Encabezado de la ficha (HU-017c-2, server): quién es. Va dentro del chrome pegado de PatientTabs,
 *  que agrega las pestañas debajo. El próximo turno pasó al Resumen. */
export function PatientHeader({
  patientId,
  name,
  phone,
  whatsappJid,
  ageYears,
  riskBackground,
}: {
  patientId: string;
  name: string | null;
  phone: string;
  /** Define si se muestra el teléfono y el botón de WhatsApp (los @lid no tienen número, D3). */
  whatsappJid: string;
  ageYears: number | null;
  riskBackground: string | null;
}) {
  const chatUrl = whatsappChatUrl({ whatsappJid, phone });
  const isPhone = classifyWhatsappJid(whatsappJid) === "phone";
  const phoneLabel = isPhone ? formatPhone(phone) : null;
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className={cn("min-w-0 truncate text-title-1", !name && "text-muted-foreground")}>
            {name ?? T.unnamed}
          </h1>
          {!name ? <HeaderNameButton patientId={patientId} phoneLabel={phoneLabel} /> : null}
        </div>
        {chatUrl ? (
          <a
            href={chatUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "secondary" }), "shrink-0")}
          >
            <MessageCircle aria-hidden />
            {T.whatsapp}
            <ExternalLink className="text-muted-foreground" aria-hidden />
            <span className="sr-only"> {T.opensInNewTab}</span>
          </a>
        ) : null}
      </div>

      <p className="mt-1 text-callout text-muted-foreground">
        {ageYears !== null ? T.ageYears(ageYears) : T.ageNotLoaded}
        <span aria-hidden> · </span>
        <span className={cn(isPhone && "whitespace-nowrap tabular-nums")}>{phoneLabel ?? HIDDEN_NUMBER_TEXT}</span>
      </p>

      {riskBackground ? <ClinicalAlert background={riskBackground} compact /> : null}
    </div>
  );
}
