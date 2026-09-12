"use client";

import { LineChart } from "@mui/x-charts/LineChart";

export interface EvolutionPoint {
  date: Date;
  value: number;
}

const dateFormatter = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit" });

export function EvolutionChart({
  points,
  seriesLabel,
  color = "#3c7a24",
  height = 160,
}: {
  points: EvolutionPoint[];
  seriesLabel: string;
  color?: string;
  height?: number;
}) {
  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <LineChart
      xAxis={[
        {
          data: sorted.map((p) => p.date),
          scaleType: "time",
          valueFormatter: (date) => dateFormatter.format(date as Date),
        },
      ]}
      series={[
        {
          data: sorted.map((p) => p.value),
          label: seriesLabel,
          color,
          curve: "monotoneX",
          showMark: true,
        },
      ]}
      height={height}
      hideLegend
      grid={{ horizontal: true }}
      margin={{ top: 10, right: 16, bottom: 24, left: 44 }}
      sx={{
        fontFamily: "inherit",
        "& .MuiChartsAxis-tickLabel": { fill: "#4a5460", fontSize: 11 },
        "& .MuiChartsAxis-line, & .MuiChartsAxis-tick": { stroke: "#dbe2d8" },
        "& .MuiChartsGrid-line": { stroke: "#dbe2d8" },
      }}
    />
  );
}
