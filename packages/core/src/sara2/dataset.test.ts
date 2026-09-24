import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures.test-helper";
import { serializeSara2Dataset, validateSara2Dataset, type Sara2Dataset } from "./dataset";
import { readSara2 } from "./read";

function sampleDataset(): Sara2Dataset {
  const r = readSara2([18, 19, 104, 105].map(fixture).join("\n"));
  return {
    format: 1,
    source: { title: "SARA 2", publisher: "Ministerio de Salud", year: 2022, file: "x.pdf", sha256: "abc" },
    status: "ok",
    summary: r.summary,
    tables: r.tables,
    foods: [...r.foods].reverse(),
  };
}

describe("dataset SARA 2", () => {
  it("serializa estable: un alimento por línea, ordenados por sourceKey, sin fecha", () => {
    const ds = sampleDataset();
    const a = serializeSara2Dataset(ds);
    const b = serializeSara2Dataset({ ...ds, foods: [...ds.foods].reverse() });
    expect(a).toBe(b);
    const foodLines = a.split("\n").filter((l) => l.includes('"sourceKey"'));
    expect(foodLines).toHaveLength(ds.foods.length);
    const keys = foodLines.map((l) => JSON.parse(l.trim().replace(/,$/, "")).sourceKey as string);
    expect(keys).toEqual([...keys].sort());
    expect(a).not.toMatch(/generatedAt|20\d\d-\d\d-\d\dT/);
    expect(JSON.parse(a).foods).toHaveLength(ds.foods.length);
  });

  it("validateSara2Dataset acepta lo serializado", () => {
    const res = validateSara2Dataset(JSON.parse(serializeSara2Dataset(sampleDataset())));
    expect(res.ok).toBe(true);
  });

  it("rechaza formato, estado, % de rechazo, claves repetidas, grupos y números inválidos", () => {
    const base = () => JSON.parse(serializeSara2Dataset(sampleDataset()));
    const bad = (mutate: (d: any) => void) => {
      const d = base();
      mutate(d);
      return validateSara2Dataset(d).ok;
    };
    expect(bad((d) => (d.format = 2))).toBe(false);
    expect(bad((d) => (d.status = "fallida"))).toBe(false);
    expect(bad((d) => (d.summary.rejectedPct = 6))).toBe(false);
    expect(bad((d) => (d.foods[1].sourceKey = d.foods[0].sourceKey))).toBe(false);
    expect(bad((d) => (d.foods[0].group = "SUPLEMENTOS"))).toBe(false);
    expect(bad((d) => (d.foods[0].kcalPer100 = NaN))).toBe(false);
    expect(bad((d) => (d.foods[0].fiberPer100 = -1))).toBe(false);
    expect(bad((d) => delete d.foods[0].nutrients.calcio)).toBe(false);
    expect(validateSara2Dataset(null).ok).toBe(false);
    expect(validateSara2Dataset([]).ok).toBe(false);
  });
});
