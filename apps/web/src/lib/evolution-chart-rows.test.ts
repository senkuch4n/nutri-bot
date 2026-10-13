import { describe, expect, it } from "vitest";
import { evolutionChartRows } from "./evolution-chart-rows";

describe("evolutionChartRows", () => {
  const pts = [
    { date: new Date("2026-09-05T15:00:00Z"), value: 74.5 },
    { date: new Date("2026-07-14T15:00:00Z"), value: 78 },
    { date: new Date("2026-08-13T15:00:00Z"), value: 76 },
  ];

  it("los valores llegan numéricos y en orden de fecha", () => {
    const rows = evolutionChartRows(pts);
    expect(rows.map((r) => r.value)).toEqual([78, 76, 74.5]);
    for (const r of rows) expect(typeof r.value).toBe("number");
    expect(rows.map((r) => r.isLast)).toEqual([false, false, true]);
  });

  it("convierte un Decimal serializado (string) a número", () => {
    const rows = evolutionChartRows([
      { date: new Date("2026-07-14T15:00:00Z"), value: "78.00" },
      { date: new Date("2026-08-13T15:00:00Z"), value: "76.5" },
    ]);
    expect(rows.map((r) => r.value)).toEqual([78, 76.5]);
    for (const r of rows) expect(typeof r.value).toBe("number");
  });

  it("descarta valores que no son números", () => {
    const rows = evolutionChartRows([
      { date: new Date("2026-07-14T15:00:00Z"), value: "abc" },
      { date: new Date("2026-08-13T15:00:00Z"), value: Number.NaN },
      { date: new Date("2026-09-05T15:00:00Z"), value: 74.5 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ value: 74.5, isLast: true });
  });
});
