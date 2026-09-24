"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/primitives/chart";

const fmtDay = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit" });
const fmtFull = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" });
const fmtNum = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

export interface ComparativeSeries {
  label: string;
  unit: string;
  color: string;
  points: { date: Date; value: number | null }[];
}

/**
 * Dos series (ej: peso vs % de grasa) como barras agrupadas por fecha, cada una con su eje Y
 * (izquierda y derecha, con la unidad en los ticks). Un valor null deja el hueco.
 */
export function ComparativeChart({
  left,
  right,
  height = 220,
}: {
  left: ComparativeSeries;
  right: ComparativeSeries;
  height?: number;
}) {
  const dates = Array.from(
    new Set(
      [...left.points, ...right.points]
        .filter((p) => p.value !== null)
        .map((p) => p.date.getTime()),
    ),
  )
    .sort((a, b) => a - b)
    .map((t) => new Date(t));

  const valueAt = (series: ComparativeSeries, date: Date) =>
    series.points.find((p) => p.date.getTime() === date.getTime())?.value ?? null;

  const rows = dates.map((d) => ({
    label: fmtDay.format(d),
    full: fmtFull.format(d),
    left: valueAt(left, d),
    right: valueAt(right, d),
  }));

  const config = {
    left: { label: `${left.label} (${left.unit})`, color: left.color },
    right: { label: `${right.label} (${right.unit})`, color: right.color },
  };
  const unitOf = (key: unknown) => (key === "right" ? right.unit : left.unit);
  const labelOf = (key: unknown) => (key === "right" ? right.label : left.label);

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart
        data={rows}
        margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
        barGap={2}
        accessibilityLayer
        title={`${left.label} vs. ${right.label}`}
      >
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={8} />
        <YAxis
          yAxisId="left"
          tickLine={false}
          axisLine={false}
          width={56}
          domain={[0, "auto"]}
          tickFormatter={(v: number) => `${fmtNum.format(v)} ${left.unit}`}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={56}
          domain={[0, "auto"]}
          tickFormatter={(v: number) => `${fmtNum.format(v)} ${right.unit}`}
        />
        <ChartTooltip
          cursor={{ className: "fill-muted" }}
          content={
            <ChartTooltipContent
              labelFormatter={(_label, payload) => String(payload?.[0]?.payload?.full ?? "")}
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
                      ? `${fmtNum.format(value)} ${unitOf(name)}`
                      : String(value ?? "")}
                  </span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar yAxisId="left" dataKey="left" fill="var(--color-left)" radius={[4, 4, 0, 0]} maxBarSize={40} />
        <Bar yAxisId="right" dataKey="right" fill="var(--color-right)" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ChartContainer>
  );
}
