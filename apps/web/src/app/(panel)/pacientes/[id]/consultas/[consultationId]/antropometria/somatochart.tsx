"use client";

import { useReducedMotionConfig } from "motion/react";
import { CartesianGrid, ReferenceDot, ReferenceLine, Scatter, ScatterChart, XAxis, YAxis } from "recharts";
import { SOMATOCHART_DOMAIN, SOMATOCHART_VERTICES, formatFixedEs } from "@nutri-bot/core";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from "@/components/primitives/chart";
import { chartDefaultColor, chartStudyColors } from "@/lib/chart-theme";

type Point = { x: number; y: number; label: string };

const config = {
  current: { label: "Actual", color: chartDefaultColor },
  previous: { label: "Anterior", color: chartStudyColors[1] },
} satisfies ChartConfig;

const V = SOMATOCHART_VERTICES;
const ENTRY_MS = 400;
const ORIGIN = { x: 0, y: 0 };
/** Ejes (origen → vértice) y contorno (vértice → vértice). El contorno curvo es de la HU-007. */
const SEGMENTS = [
  { key: "axis-endo", segment: [ORIGIN, V.endomorph] },
  { key: "axis-meso", segment: [ORIGIN, V.mesomorph] },
  { key: "axis-ecto", segment: [ORIGIN, V.ectomorph] },
  { key: "edge-endo-meso", segment: [V.endomorph, V.mesomorph] },
  { key: "edge-meso-ecto", segment: [V.mesomorph, V.ectomorph] },
  { key: "edge-ecto-endo", segment: [V.ectomorph, V.endomorph] },
] as const;

function domainAndTicks(base: readonly [number, number], values: number[]): { domain: [number, number]; ticks: number[] } {
  const min = Math.min(base[0], ...values.map((v) => Math.floor(v / 2) * 2));
  const max = Math.max(base[1], ...values.map((v) => Math.ceil(v / 2) * 2));
  const ticks: number[] = [];
  for (let t = min; t <= max; t += 2) ticks.push(t);
  return { domain: [min, max], ticks };
}

function pointText(name: string, p: Point): string {
  return `${name} · ${p.label} · X ${formatFixedEs(p.x, 2)} · Y ${formatFixedEs(p.y, 2)}`;
}

/** Somatocarta de Heath-Carter (HU-006) con el punto actual y, si hay, el anterior. */
export function Somatochart({
  current,
  previous,
  missingNote,
}: {
  current: Point | null;
  previous: Point | null;
  /** Por qué no se puede dibujar (p. ej. "Sin dato (falta mesomorfia)"). */
  missingNote?: string;
}) {
  // HU-017c-3: entrada de ≤ 400 ms; sin animación con movimiento reducido.
  const reduced = useReducedMotionConfig();
  if (!current) {
    return <p className="text-sm text-muted-foreground">{missingNote ?? "Sin datos para la somatocarta."}</p>;
  }
  const points = previous ? [current, previous] : [current];
  const x = domainAndTicks(SOMATOCHART_DOMAIN.x, points.map((p) => p.x));
  const y = domainAndTicks(SOMATOCHART_DOMAIN.y, points.map((p) => p.y));

  return (
    <figure>
      <ChartContainer config={config} className="mx-auto aspect-auto w-full max-w-md" style={{ height: 380 }}>
        <ScatterChart margin={{ top: 24, right: 16, bottom: 16, left: 0 }} accessibilityLayer title="Somatocarta">
          <CartesianGrid />
          <XAxis type="number" dataKey="x" domain={x.domain} ticks={x.ticks} tickLine={false} axisLine={false} />
          <YAxis type="number" dataKey="y" domain={y.domain} ticks={y.ticks} tickLine={false} axisLine={false} width={32} />
          {SEGMENTS.map((s) => (
            <ReferenceLine key={s.key} segment={[...s.segment]} ifOverflow="visible" />
          ))}
          <ReferenceDot
            x={V.mesomorph.x}
            y={V.mesomorph.y}
            r={0}
            label={{ value: "Mesomorfia", position: "top", className: "fill-muted-foreground text-xs" }}
          />
          <ReferenceDot
            x={V.endomorph.x}
            y={V.endomorph.y}
            r={0}
            label={{ value: "Endomorfia", position: "bottom", className: "fill-muted-foreground text-xs" }}
          />
          <ReferenceDot
            x={V.ectomorph.x}
            y={V.ectomorph.y}
            r={0}
            label={{ value: "Ectomorfia", position: "bottom", className: "fill-muted-foreground text-xs" }}
          />
          <ChartTooltip
            cursor={false}
            content={({ active, payload }) => {
              const item = payload?.[0];
              if (!active || !item) return null;
              const p = item.payload as Point;
              const name = item.name === "previous" ? config.previous.label : config.current.label;
              return (
                <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs tabular-nums shadow-xl">
                  {pointText(name, p)}
                </div>
              );
            }}
          />
          <ChartLegend verticalAlign="top" content={<ChartLegendContent />} />
          {previous ? (
            <Scatter
              name="previous"
              data={[previous]}
              fill="var(--color-previous)"
              shape="diamond"
              legendType="diamond"
              isAnimationActive={!reduced}
              animationDuration={ENTRY_MS}
            />
          ) : null}
          <Scatter
            name="current"
            data={[current]}
            fill="var(--color-current)"
            shape="circle"
            legendType="circle"
            isAnimationActive={!reduced}
            animationDuration={ENTRY_MS}
          />
        </ScatterChart>
      </ChartContainer>
      <figcaption className="sr-only">
        Somatocarta. {pointText(config.current.label, current)}
        {previous ? `. ${pointText(config.previous.label, previous)}` : ""}
      </figcaption>
    </figure>
  );
}
