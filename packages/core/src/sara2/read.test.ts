import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures.test-helper";
import { SARA2_EXCLUDED_REASON, readSara2 } from "./read";
import { renderSara2Report } from "./report";

const concat = (...pages: number[]) => pages.map(fixture).join("\n");

describe("readSara2 con páginas reales", () => {
  it("p. 97 + 98: 'Salmón blanco, crudo' no está en la parte B", () => {
    const r = readSara2(concat(97, 98));
    const salmon = r.rejected.find((x) => x.name === "Salmón blanco, crudo");
    expect(salmon?.reason).toBe("SIN_PAREJA_B");
    const rosado = r.foods.find((f) => f.name === "Salmón rosado, crudo");
    expect(rosado?.group).toBe("PESCADOS_Y_MARISCOS");
    expect(rosado?.table).toBe(9);
    expect(r.rejected.every((x) => x.reason !== "SIN_PAREJA_A")).toBe(true);
  });

  it("p. 104 + 105: la B dice '16.B' pero hereda la tabla 12 de su A", () => {
    const r = readSara2(concat(104, 105));
    expect(r.foods.length).toBeGreaterThan(10);
    expect(new Set(r.foods.map((f) => f.table))).toEqual(new Set([12]));
    expect(new Set(r.foods.map((f) => f.group))).toEqual(new Set(["AZUCARES_MERMELADAS_Y_DULCES"]));
    expect(r.foods.find((f) => f.name === "Azúcar blanca molida")?.sourceKey).toBe("sara2:t12:azucar-blanca-molida");
    expect(r.warnings.some((w) => w.code === "TITULO_B_DISTINTO")).toBe(true);
  });

  it("p. 137 (tabla 26): todas sus filas van a excluidas", () => {
    const r = readSara2(fixture(137));
    expect(r.excluded.length).toBeGreaterThan(0);
    expect(r.excluded.every((e) => e.reason === SARA2_EXCLUDED_REASON)).toBe(true);
    expect(r.foods).toEqual([]);
  });

  it("una página A sin su B → fallida por L1", () => {
    const r = readSara2(fixture(18));
    expect(r.status).toBe("fallida");
    expect(r.failures.some((f) => f.startsWith("L1"))).toBe(true);
    expect(r.rejected.every((x) => x.reason === "SIN_PAREJA_B")).toBe(true);
  });

  it("p. 18 + 19: 20 alimentos de verduras, todos importados con nombre sano", () => {
    const r = readSara2(concat(18, 19));
    expect(r.summary.rowsA).toBe(20);
    expect(r.summary.imported + r.summary.rejected).toBe(20);
    expect(r.foods.every((f) => f.group === "VERDURAS")).toBe(true);
    expect(r.foods.find((f) => f.name === "Ají verde o amarillo / morrón verde o amarillo, crudo")).toBeDefined();
    const md = renderSara2Report(r, { file: "x.pdf", sha256: "abc", generatedAt: "2026-09-24" });
    expect(md).toContain("**Importación fallida:**");
    expect(md).toContain("| 1 | Verduras | 20 | 20 |");
  });
});
