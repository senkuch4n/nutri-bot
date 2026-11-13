import { cn } from "@/lib/utils";

const WIDTH = 96;
const HEIGHT = 32;
const PAD = 3;

/**
 * Minigráfico de los últimos pesos (HU-017c-2, Q9): una línea SVG, server component, sin librerías.
 * Decorativo (`aria-hidden`): el dato está en texto al lado. Color neutro de acento (D10: no juzga).
 */
export function WeightSparkline({ series, className }: { series: readonly number[]; className?: string }) {
  if (series.length < 2) return null;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const step = (WIDTH - PAD * 2) / (series.length - 1);
  const points = series.map((value, i) => {
    const x = PAD + i * step;
    // Sin variación, la línea va por el medio.
    const y = max === min ? HEIGHT / 2 : PAD + (1 - (value - min) / range) * (HEIGHT - PAD * 2);
    return [x, y] as const;
  });
  const last = points[points.length - 1]!;
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      aria-hidden
      focusable="false"
      className={cn("shrink-0 overflow-visible text-primary", className)}
    >
      <polyline
        points={points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last[0]} cy={last[1]} r={3} fill="currentColor" />
    </svg>
  );
}
