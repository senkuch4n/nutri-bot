import { TriangleAlert } from "lucide-react";
import { Alert } from "@/components/ui";
import { PatientTabLink } from "./patient-tabs";

/**
 * Antecedentes de riesgo. `compact` es la versión de una línea del encabezado persistente;
 * sin `compact` es el callout completo de la pestaña "Datos y ficha clínica".
 */
export function ClinicalAlert({ background, compact }: { background: string; compact?: boolean }) {
  if (compact) {
    return (
      <div
        role="note"
        className="mt-3 flex items-center gap-2 rounded-md border border-warning/30 bg-warning-muted px-3 py-1.5 text-sm"
      >
        <TriangleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden />
        <span className="shrink-0 font-medium text-warning">Antecedentes:</span>
        <span className="min-w-0 flex-1 truncate text-foreground" title={background}>
          {background}
        </span>
        <PatientTabLink tab="datos" className="shrink-0">
          Ver ficha clínica
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
