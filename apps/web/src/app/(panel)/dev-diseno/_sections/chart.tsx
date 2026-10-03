"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/primitives/chart";
import { chartPalette } from "@/lib/design-tokens";
import { DemoLabel, DemoSection } from "./section";

const rows = [
  { label: "Jun", a: 64.1, b: 28.9, c: 23.8 },
  { label: "Jul", a: 63.0, b: 28.4, c: 24.0 },
  { label: "Ago", a: 62.4, b: 28.1, c: 24.2 },
  { label: "Sep", a: 61.9, b: 27.9, c: 24.4 },
  { label: "Oct", a: 61.2, b: 27.8, c: 24.5 },
];

function Swatches({ title, colors }: { title: string; colors: Record<string, string> | readonly string[] }) {
  const entries = Array.isArray(colors) ? colors.map((c, i) => [String(i + 1), c] as const) : Object.entries(colors);
  return (
    <div>
      <DemoLabel>{title}</DemoLabel>
      <ul className="flex flex-wrap gap-3">
        {entries.map(([name, hex]) => (
          <li key={name} className="flex items-center gap-2 text-footnote">
            <span aria-hidden className="size-4 rounded-xs" style={{ backgroundColor: hex }} />
            <span className="font-medium">{name}</span>
            <span className="tabular-nums text-muted-foreground">{hex}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Gráfico con la paleta nueva (chartPalette). Recharts anima solo si el sistema no pide movimiento reducido. */
export function ChartSection() {
  const [c1, c2, c3] = chartPalette.series;
  return (
    <DemoSection
      id="graficos"
      index={14}
      title="Gráficos"
      description="Serie principal en tint; todas las series llegan a 3:1 sobre blanco. Con movimiento reducido las barras aparecen sin crecer."
    >
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-xl bg-card p-5 shadow-card">
          <ChartContainer
            config={{ a: { label: "Peso (kg)", color: c1 }, b: { label: "Grasa (%)", color: c2 }, c: { label: "Músculo (kg)", color: c3 } }}
            className="aspect-auto h-64 w-full"
          >
            <BarChart data={rows} accessibilityLayer title="Evolución de ejemplo">
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={40} />
              <ChartTooltip cursor={{ className: "fill-muted" }} content={<ChartTooltipContent />} />
              <Bar dataKey="a" fill="var(--color-a)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="b" fill="var(--color-b)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="c" fill="var(--color-c)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ChartContainer>
        </div>
        <div className="space-y-5 rounded-xl bg-card p-5 shadow-card">
          <Swatches title="Series" colors={chartPalette.series} />
          <Swatches title="Estudios (el último va en tint)" colors={chartPalette.study} />
          <Swatches title="Métricas" colors={chartPalette.metric} />
          <Swatches title="Tejidos ISAK" colors={chartPalette.tissue} />
        </div>
      </div>
    </DemoSection>
  );
}
