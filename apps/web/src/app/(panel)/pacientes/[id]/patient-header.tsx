import type { PatientStage } from "@nutri-bot/core";
import { PATIENT_SUMMARY_TEXT } from "@nutri-bot/core";
import { cn } from "@/lib/utils";
import { ClinicalAlert } from "./clinical-alert";
import { HeaderNameButton } from "./header-name-button";
import { PatientHeaderActions } from "./patient-header-actions";
import { PatientHeaderIdentity } from "./patient-header-identity";

const T = PATIENT_SUMMARY_TEXT;

/** Encabezado de la ficha (server), con el diseño de referencia: avatar con iniciales, nombre, sexo,
 *  edad y nacimiento, el estado arriba a la derecha y las acciones debajo. Va antes de las pestañas
 *  de PatientTabs (que son lo único que se pega arriba al scrollear). */
export function PatientHeader({
  patientId,
  name,
  initials,
  stage,
  sexLabel,
  ageYears,
  birthDateLabel,
  phoneLabel,
  contactLabel,
  riskBackground,
  archived,
  actions,
  className,
  inDialog = false,
}: {
  patientId: string;
  name: string | null;
  initials: string;
  /** null: el contacto no es una persona (sin estado). */
  stage: PatientStage | null;
  sexLabel: string | null;
  ageYears: number | null;
  /** "Nació el 15/06/2004", o null si no está cargada. */
  birthDateLabel: string | null;
  /** Teléfono formateado; null si el contacto no tiene número (@lid). */
  phoneLabel: string | null;
  /** phoneLabel o HIDDEN_NUMBER_TEXT. */
  contactLabel: string;
  riskBackground: string | null;
  archived: boolean;
  actions: Omit<React.ComponentProps<typeof PatientHeaderActions>, "patientId" | "name" | "contactLabel" | "archived">;
  className?: string;
  /** Dentro del modal de la lista: el nombre es el título del diálogo (Radix lo pide). */
  inDialog?: boolean;
}) {
  const facts = [sexLabel, ageYears !== null ? T.ageYears(ageYears) : T.ageNotLoaded, birthDateLabel].filter(
    (f): f is string => Boolean(f),
  );
  return (
    <div className={cn("relative", className)}>
      <PatientHeaderIdentity
        initials={initials}
        stage={stage}
        archived={archived}
        name={name}
        inDialog={inDialog}
        nameAside={!name ? <HeaderNameButton patientId={patientId} phoneLabel={phoneLabel} /> : null}
      />

      <ul className="mt-2 space-y-0.5 text-callout text-muted-foreground">
        {facts.map((f) => (
          <li key={f}>{f}</li>
        ))}
        <li className={cn(phoneLabel && "tabular-nums")}>{contactLabel}</li>
      </ul>

      <div className="mt-5">
        <PatientHeaderActions
          patientId={patientId}
          name={name?.trim() || null}
          contactLabel={contactLabel}
          archived={archived}
          {...actions}
        />
      </div>

      {riskBackground ? <ClinicalAlert background={riskBackground} compact /> : null}
    </div>
  );
}
