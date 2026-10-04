"use client";

import { ChartColumn } from "lucide-react";
import { EvolutionChart } from "@/components/evolution-chart";
import { Card, EmptyState, Quantity } from "@/components/ui";
import { chartMetricColors } from "@/lib/chart-theme";
import { latestWithDelta, seriesPoints } from "@/lib/evolution-series";
import { DeltaLine } from "./evolution-charts";
import type { EvolutionRow } from "./evolution-types";
import { PatientTabLink } from "./patient-tabs";

const KPIS = [
  { key: "weightKg", label: "Peso", unit: "kg" },
  { key: "waistCm", label: "Cintura", unit: "cm" },
  { key: "bodyFatPercent", label: "Grasa corporal", unit: "%" },
  { key: "muscleMassKg", label: "Masa muscular", unit: "kg" },
] as const satisfies readonly { key: keyof EvolutionRow; label: string; unit: string }[];

/** Card "Evolución" de la pestaña Resumen: últimos valores con variación + barras de peso. */
export function EvolutionSummary({ entries }: { entries: EvolutionRow[] }) {
  const link = <PatientTabLink tab="historial" view="medidas">Ver evolución completa</PatientTabLink>;

  if (entries.length === 0) {
    return (
      <Card title="Evolución" actions={link}>
        <EmptyState
          icon={ChartColumn}
          title="Todavía no hay mediciones"
          description="Cargá la primera en la pestaña Evolución."
          action={<PatientTabLink tab="historial" view="medidas">Cargar medición</PatientTabLink>}
        />
      </Card>
    );
  }

  // Etiqueta calculada en el server (huso de la profesional): sin desfase de hidratación.
  const latest = entries.reduce((max, e) => (e.recordedAtISO > max.recordedAtISO ? e : max));
  const weight = seriesPoints(entries, (e) => e.weightKg).slice(-8);

  return (
    <Card title="Evolución" description={`Última medición: ${latest.recordedAtLabel}`} actions={link}>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {KPIS.map((kpi) => {
          const latest = latestWithDelta(seriesPoints(entries, (e) => e[kpi.key]));
          return (
            <div key={kpi.key}>
              <dt className="text-sm text-muted-foreground">{kpi.label}</dt>
              <dd className="mt-1">
                <Quantity value={latest?.value ?? null} unit={kpi.unit} className="text-xl font-semibold" />
                {latest && latest.delta !== null ? (
                  <div className="[&>p]:justify-start">
                    <DeltaLine delta={latest.delta} unit={kpi.unit} />
                  </div>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
      {weight.length > 0 ? (
        <div className="mt-6">
          <EvolutionChart
            points={weight}
            seriesLabel="Peso"
            unit="kg"
            color={chartMetricColors.weightKg}
            height={180}
          />
        </div>
      ) : null}
    </Card>
  );
}
