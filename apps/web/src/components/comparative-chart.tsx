"use client";

import { LineChart } from "@mui/x-charts/LineChart";
import { chartSx } from "@/lib/chart-theme";

const dateFormatter = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit" });

export interface ComparativeSeries {
  label: string;
  unit: string;
  color: string;
  points: { date: Date; value: number | null }[];
}

/** Superpone dos series (ej: peso vs % de grasa) en el mismo eje de tiempo, cada una con su propio eje Y. */
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

  return (
    <LineChart
      xAxis={[
        {
          data: dates,
          scaleType: "time",
          valueFormatter: (date) => dateFormatter.format(date as Date),
        },
      ]}
      yAxis={[
        { id: "left", label: `${left.label} (${left.unit})` },
        { id: "right", label: `${right.label} (${right.unit})` },
      ]}
      series={[
        {
          id: "left",
          yAxisId: "left",
          data: dates.map((d) => valueAt(left, d)),
          label: `${left.label} (${left.unit})`,
          color: left.color,
          curve: "monotoneX",
          showMark: true,
          connectNulls: true,
        },
        {
          id: "right",
          yAxisId: "right",
          data: dates.map((d) => valueAt(right, d)),
          label: `${right.label} (${right.unit})`,
          color: right.color,
          curve: "monotoneX",
          showMark: true,
          connectNulls: true,
        },
      ]}
      height={height}
      grid={{ horizontal: true }}
      margin={{ top: 10, right: 48, bottom: 24, left: 48 }}
      sx={chartSx}
    />
  );
}
