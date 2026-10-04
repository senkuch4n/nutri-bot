import { TriangleAlert } from "lucide-react";
import { PATIENT_SUMMARY_TEXT } from "@nutri-bot/core";
import { Alert } from "@/components/ui";
import { PatientTabLink } from "./patient-tabs";

/**
 * Antecedentes de riesgo. `compact` es la franja de una línea del encabezado pegado, con "Ver
 * antecedentes" (lleva a "Datos de la paciente" en el Resumen); sin `compact` es el aviso completo
 * dentro de "Datos de la paciente".
 */
export function ClinicalAlert({ background, compact }: { background: string; compact?: boolean }) {
  if (compact) {
    return (
      <div
        role="note"
        className="mt-2 flex min-h-9 items-center gap-2 rounded-md bg-warning-muted px-3 py-1.5 text-callout more-contrast:border more-contrast:border-warning"
      >
        <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
        <span className="shrink-0 font-semibold text-warning">{PATIENT_SUMMARY_TEXT.backgroundLabel}:</span>
        <span className="min-w-0 flex-1 truncate text-foreground" title={background}>
          {background}
        </span>
        <PatientTabLink tab="resumen" focus="datos" className="shrink-0">
          {PATIENT_SUMMARY_TEXT.seeBackground}
        </PatientTabLink>
      </div>
    );
  }

  return (
    <Alert tone="warning" title="Antecedentes a tener en cuenta">
      <p className="whitespace-pre-wrap">{background}</p>
    </Alert>
  );
}
