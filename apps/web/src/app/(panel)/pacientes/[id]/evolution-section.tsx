"use client";

import { Card } from "@/components/ui";
import { EvolutionCharts } from "./evolution-charts";
import { EvolutionForm } from "./evolution-form";
import { EvolutionTable } from "./evolution-table";
import type { EvolutionRow } from "./evolution-types";

export type { EvolutionRow } from "./evolution-types";

/** Pestaña Evolución: alta de medición, gráficos y tabla de mediciones. */
export function EvolutionSection({
  patientId,
  entries,
  todayKey,
}: {
  patientId: string;
  entries: EvolutionRow[];
  /** "yyyy-MM-dd" de hoy en la zona de la profesional (calculado en el server). */
  todayKey: string;
}) {
  return (
    <div className="space-y-8">
      <Card title="Nueva medición" description="Fecha, peso y nota. El resto de las medidas es opcional.">
        <EvolutionForm patientId={patientId} todayKey={todayKey} />
      </Card>
      <EvolutionCharts entries={entries} />
      <EvolutionTable patientId={patientId} entries={entries} />
    </div>
  );
}
