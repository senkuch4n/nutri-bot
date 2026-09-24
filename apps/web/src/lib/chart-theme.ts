import type { SxProps, Theme } from "@mui/material/styles";

// Único lugar donde viven los colores de serie. Van en hex porque el SVG de MUI los necesita
// resueltos. Todos ≥ 3:1 sobre blanco (AA para elementos no textuales).
// info · success · ámbar · violeta · destructive
export const chartSeriesColors = ["#2C6890", "#396F51", "#B37D19", "#7959A6", "#B53A36"] as const;

export const chartDefaultColor = "#2C6890";

/** sx para MUI X Charts: ejes, ticks, grilla y leyenda sobre los tokens. */
export const chartSx = {
  fontFamily: "inherit",
  "& .MuiChartsAxis-tickLabel": { fill: "hsl(var(--muted-foreground))", fontSize: 12 },
  "& .MuiChartsAxis-label": { fill: "hsl(var(--muted-foreground))" },
  "& .MuiChartsAxis-line, & .MuiChartsAxis-tick": { stroke: "hsl(var(--border))" },
  "& .MuiChartsGrid-line": { stroke: "hsl(var(--border))" },
  "& .MuiChartsLegend-label": { fill: "hsl(var(--foreground))" },
} satisfies SxProps<Theme>;

export const chartMargin = { top: 12, right: 16, bottom: 28, left: 44 };
