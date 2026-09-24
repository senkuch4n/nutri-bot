"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/primitives/chart";
import { studyColor } from "@/lib/chart-theme";

export interface StudyComparisonStudy {
  id: string;
  label: string;
  values: Record<string, number | null>;
}

/**
 * Compara los últimos estudios (mediciones) medida por medida: barras agrupadas por medida, una
 * barra por estudio, de más viejo (gris claro) a más nuevo (azul). Las medidas sin ningún valor
 * en los estudios elegidos no se muestran.
 */
export function StudyComparisonChart({
  title,
  measures,
  studies,
  unit,
  height = 240,
  decimals = 1,
}: {
  title: string;
  measures: { key: string; label: string }[];
  studies: StudyComparisonStudy[];
  unit: string;
  height?: number;
  decimals?: number;
}) {
  const fmtNum = new Intl.NumberFormat("es-AR", { maximumFractionDigits: decimals });
  const visible = measures.filter((m) =>
    studies.some((s) => s.values[m.key] !== null && s.values[m.key] !== undefined),
  );

  if (visible.length === 0 || studies.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin datos para graficar.</p>;
  }

  const data = visible.map((m) => ({
    measure: m.label,
    ...Object.fromEntries(studies.map((s) => [s.id, s.values[m.key] ?? null])),
  }));

  const config: ChartConfig = Object.fromEntries(
    studies.map((s, i) => [s.id, { label: s.label, color: studyColor(i, studies.length) }]),
  );
  const labelOf = (key: unknown) => studies.find((s) => s.id === key)?.label ?? String(key ?? "");

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        barGap={2}
        accessibilityLayer
        title={title}
      >
        <CartesianGrid vertical={false} />
        <XAxis dataKey="measure" tickLine={false} axisLine={false} tickMargin={8} interval={0} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          domain={[0, "auto"]}
          tickFormatter={(v: number) => `${fmtNum.format(v)} ${unit}`}
        />
        <ChartTooltip
          cursor={{ className: "fill-muted" }}
          content={
            <ChartTooltipContent
              formatter={(value, name, item) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-muted-foreground">{labelOf(name)}</span>
                  </span>
                  <span className="font-medium tabular-nums text-foreground">
                    {typeof value === "number"
                      ? `${fmtNum.format(value)} ${unit}`
                      : String(value ?? "")}
                  </span>
                </div>
              )}
            />
          }
        />
        <ChartLegend verticalAlign="top" content={<ChartLegendContent />} />
        {studies.map((s) => (
          <Bar key={s.id} dataKey={s.id} fill={`var(--color-${s.id})`} radius={[3, 3, 0, 0]} maxBarSize={28} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
