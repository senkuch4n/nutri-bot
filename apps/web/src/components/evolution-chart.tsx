"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/primitives/chart";
import { chartDefaultColor } from "@/lib/chart-theme";

export interface EvolutionPoint {
  date: Date;
  value: number;
}

const fmtDay = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit" });
const fmtFull = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" });

/**
 * Una serie en el tiempo como barras con base en cero (una barra por medición). La variación se
 * lee en el número (etiqueta encima de cada barra y KPI arriba del gráfico), no en la altura.
 * La usa también `portal/evolucion` (sin `unit`).
 */
export function EvolutionChart({
  points,
  seriesLabel,
  color = chartDefaultColor,
  height = 160,
  unit,
  decimals = 1,
  showValues,
}: {
  points: EvolutionPoint[];
  seriesLabel: string;
  color?: string;
  height?: number;
  unit?: string;
  decimals?: number;
  showValues?: boolean;
}) {
  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());
  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin datos para graficar.</p>;
  }

  const fmtNum = new Intl.NumberFormat("es-AR", { maximumFractionDigits: decimals });
  const withUnit = (n: number) => fmtNum.format(n) + (unit ? ` ${unit}` : "");
  const labels = showValues ?? sorted.length <= 8;

  const rows = sorted.map((p, i) => ({
    label: fmtDay.format(p.date),
    full: fmtFull.format(p.date),
    value: p.value,
    isLast: i === sorted.length - 1,
  }));

  return (
    <ChartContainer
      config={{ value: { label: seriesLabel, color } }}
      className="aspect-auto w-full"
      style={{ height }}
    >
      <BarChart
        data={rows}
        margin={{ top: 20, right: 8, bottom: 0, left: 0 }}
        accessibilityLayer
        title={seriesLabel}
      >
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={8} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={unit === "kcal" ? 64 : 48}
          domain={[0, "auto"]}
          tickFormatter={(v: number) => fmtNum.format(v) + (unit ? ` ${unit}` : "")}
        />
        <ChartTooltip
          cursor={{ className: "fill-muted" }}
          content={
            <ChartTooltipContent
              labelFormatter={(_label, payload) => String(payload?.[0]?.payload?.full ?? "")}
              formatter={(value, _name, item) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: item.payload?.fill ?? color }}
                    />
                    <span className="text-muted-foreground">{seriesLabel}</span>
                  </span>
                  <span className="font-medium tabular-nums text-foreground">
                    {typeof value === "number" ? withUnit(value) : String(value ?? "")}
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
          {rows.map((r, i) => (
            <Cell key={i} fill={color} fillOpacity={r.isLast ? 1 : 0.85} />
          ))}
          {labels ? (
            <LabelList
              dataKey="value"
              position="top"
              className="fill-foreground text-xs tabular-nums"
              formatter={(v) => (typeof v === "number" ? fmtNum.format(v) : v)}
            />
          ) : null}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
