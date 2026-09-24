"use client";

import { ArrowDown, ArrowUp, ChartColumn, Minus } from "lucide-react";
import { ComparativeChart } from "@/components/comparative-chart";
import { EvolutionChart } from "@/components/evolution-chart";
import { StudyComparisonChart } from "@/components/study-comparison-chart";
import { Card, EmptyState, Quantity, SectionLabel } from "@/components/ui";
import { chartMetricColors } from "@/lib/chart-theme";
import { formatDelta, lastStudies, latestWithDelta, seriesPoints, type SeriesPoint } from "@/lib/evolution-series";
import {
  BIOIMPEDANCE_FIELDS,
  BIOIMPEDANCE_METRICS,
  PERIMETER_MEASURES,
  SKINFOLD_MEASURES,
  hasAnyValue,
  type EvolutionRow,
} from "./evolution-types";

/** Último valor + variación contra el anterior, para el `actions` de cada Card. Sin color bueno/malo. */
export function LatestValue({
  points,
  unit,
  decimals = 1,
}: {
  points: readonly SeriesPoint[];
  unit?: string;
  decimals?: number;
}) {
  const latest = latestWithDelta(points);
  if (!latest) return null;
  return (
    <div className="text-right">
      <Quantity value={latest.value} unit={unit} decimals={decimals} className="text-base font-semibold" />
      {latest.delta !== null ? <DeltaLine delta={latest.delta} unit={unit ?? ""} decimals={decimals} /> : null}
    </div>
  );
}

export function DeltaLine({ delta, unit, decimals = 1 }: { delta: number; unit: string; decimals?: number }) {
  const text = formatDelta(delta, unit, decimals);
  const Icon = text === "Sin cambios" ? Minus : delta > 0 ? ArrowUp : ArrowDown;
  return (
    <p className="mt-0.5 flex items-center justify-end gap-1 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="tabular-nums">{text}</span>
    </p>
  );
}

function studiesFor(entries: EvolutionRow[], measures: readonly { key: keyof EvolutionRow }[]) {
  const fields = measures.map((m) => m.key);
  return lastStudies(entries, fields, 4).map((e) => ({
    id: e.id,
    label: e.recordedAtShortLabel,
    values: Object.fromEntries(fields.map((f) => [f, e[f] as number | null])),
  }));
}

function studiesLabel(n: number) {
  return n === 1 ? "Último estudio" : `Últimos ${n} estudios`;
}

export function EvolutionCharts({ entries }: { entries: EvolutionRow[] }) {
  if (entries.length === 0) {
    return (
      <section aria-labelledby="graficos-titulo">
        <SectionLabel>
          <span id="graficos-titulo">Gráficos</span>
        </SectionLabel>
        <Card>
          <EmptyState
            icon={ChartColumn}
            title="Todavía no hay mediciones"
            description="Cuando cargues la primera, acá vas a ver cómo evoluciona."
          />
        </Card>
      </section>
    );
  }

  const weight = seriesPoints(entries, (e) => e.weightKg);
  const fat = seriesPoints(entries, (e) => e.bodyFatPercent);
  const hasWeightAndFat = weight.length > 0 && fat.length > 0;
  const hasPerimeters = hasAnyValue(entries, PERIMETER_MEASURES.map((m) => m.key));
  const hasSkinfolds = hasAnyValue(entries, SKINFOLD_MEASURES.map((m) => m.key));
  const hasBioimpedance = hasAnyValue(entries, BIOIMPEDANCE_FIELDS);
  const perimeterStudies = hasPerimeters ? studiesFor(entries, PERIMETER_MEASURES) : [];
  const skinfoldStudies = hasSkinfolds ? studiesFor(entries, SKINFOLD_MEASURES) : [];

  return (
    <div className="space-y-8">
      <section aria-labelledby="graficos-titulo">
        <SectionLabel>
          <span id="graficos-titulo">Gráficos</span>
        </SectionLabel>
        <div className="grid gap-6 lg:grid-cols-2">
          {weight.length > 0 ? (
            <Card title="Peso" actions={<LatestValue points={weight} unit="kg" />}>
              <EvolutionChart
                points={weight}
                seriesLabel="Peso"
                unit="kg"
                color={chartMetricColors.weightKg}
                height={220}
              />
            </Card>
          ) : null}

          {hasWeightAndFat ? (
            <Card title="Peso vs. grasa corporal" description="Peso en kg a la izquierda, grasa en % a la derecha.">
              <ComparativeChart
                left={{
                  label: "Peso",
                  unit: "kg",
                  color: chartMetricColors.weightKg,
                  points: entries.map((e) => ({ date: new Date(e.recordedAtISO), value: e.weightKg })),
                }}
                right={{
                  label: "Grasa corporal",
                  unit: "%",
                  color: chartMetricColors.bodyFatPercent,
                  points: entries.map((e) => ({ date: new Date(e.recordedAtISO), value: e.bodyFatPercent })),
                }}
                height={220}
              />
            </Card>
          ) : null}

          {perimeterStudies.length > 0 ? (
            <Card title="Perímetros" description={studiesLabel(perimeterStudies.length)}>
              <StudyComparisonChart
                title="Perímetros"
                measures={PERIMETER_MEASURES.map((m) => ({ key: m.key, label: m.label }))}
                studies={perimeterStudies}
                unit="cm"
                height={240}
              />
            </Card>
          ) : null}

          {skinfoldStudies.length > 0 ? (
            <Card title="Pliegues" description={studiesLabel(skinfoldStudies.length)}>
              <StudyComparisonChart
                title="Pliegues"
                measures={SKINFOLD_MEASURES.map((m) => ({ key: m.key, label: m.label }))}
                studies={skinfoldStudies}
                unit="mm"
                height={240}
              />
            </Card>
          ) : null}
        </div>
      </section>

      {hasBioimpedance ? (
        <section aria-labelledby="bioimpedancia-titulo">
          <SectionLabel>
            <span id="bioimpedancia-titulo">Bioimpedancia</span>
          </SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {BIOIMPEDANCE_METRICS.map((metric) => {
              const points = seriesPoints(entries, (e) => e[metric.key]);
              if (points.length === 0) return null;
              return (
                <Card
                  key={metric.key}
                  title={metric.label}
                  actions={<LatestValue points={points} unit={metric.unit || undefined} decimals={metric.decimals} />}
                >
                  <EvolutionChart
                    points={points}
                    seriesLabel={metric.label}
                    unit={metric.unit || undefined}
                    decimals={metric.decimals}
                    color={chartMetricColors[metric.key]}
                    height={140}
                  />
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
