import { describe, expect, it } from "vitest";
import {
  atwaterBreakdown,
  atwaterKcal,
  computeItemMacros,
  formatAtwaterCompact,
  formatAtwaterPart,
  formatKcalOneDecimal,
  formatMacroAmount,
  formatMacrosLine,
  kcalDiffersFromAtwater,
  sumMacros,
  validateOwnFoodMacros,
} from "./nutrition";

describe("nutrition macros", () => {
  it("calcula macros según los gramos", () => {
    expect(
      computeItemMacros(
        { kcalPer100: 165, proteinPer100: 31, carbsPer100: 0, fatPer100: 3.6, fiberPer100: 2 },
        150,
      ),
    ).toEqual({ kcal: 247.5, protein: 46.5, carbs: 0, fat: 5.4, fiber: 3 });
  });

  it("devuelve ceros para una cantidad no positiva", () => {
    expect(computeItemMacros({ kcalPer100: 100, proteinPer100: 10, carbsPer100: 5, fatPer100: 2, fiberPer100: 2 }, 0)).toEqual({
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
    });
  });

  it("suma dos o más ítems y redondea", () => {
    expect(
      sumMacros([
        { kcal: 100.04, protein: 10.2, carbs: 4.1, fat: 2.05, fiber: 1.04 },
        { kcal: 50.06, protein: 2.3, carbs: 1.2, fat: 1.05, fiber: 0.56 },
        { kcal: 10, protein: 0, carbs: 2, fat: 0, fiber: 0 },
      ]),
    ).toEqual({ kcal: 160.1, protein: 12.5, carbs: 7.3, fat: 3.1, fiber: 1.6 });
  });
});

describe("formato de macros (es-AR)", () => {
  const NBSP = " ";
  const totals = { kcal: 1845.6, protein: 92.5, carbs: 210.3, fat: 61, fiber: 25.2 };

  it("kcal sin decimales y con separador de miles", () => {
    expect(formatMacroAmount(1845.6, "kcal")).toBe(`1.846${NBSP}kcal`);
  });

  it("kcal redondea hacia arriba al cruzar el millar", () => {
    expect(formatMacroAmount(999.5, "kcal")).toBe(`1.000${NBSP}kcal`);
  });

  it("gramos con hasta 1 decimal, coma decimal y sin ',0'", () => {
    expect(formatMacroAmount(92.5, "g")).toBe(`92,5${NBSP}g`);
    expect(formatMacroAmount(61, "g")).toBe(`61${NBSP}g`);
    expect(formatMacroAmount(12345.5, "g")).toBe(`12.345,5${NBSP}g`);
  });

  it("arma la línea de totales del plan", () => {
    expect(formatMacrosLine(totals)).toBe(
      `1.846${NBSP}kcal · P 92,5${NBSP}g · C 210,3${NBSP}g · G 61${NBSP}g`,
    );
  });

  it("con includeFiber suma la fibra al final", () => {
    expect(formatMacrosLine(totals, { includeFiber: true })).toBe(
      `1.846${NBSP}kcal · P 92,5${NBSP}g · C 210,3${NBSP}g · G 61${NBSP}g · Fibra 25,2${NBSP}g`,
    );
  });

  it("todo en cero", () => {
    expect(formatMacrosLine({ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })).toBe(
      `0${NBSP}kcal · P 0${NBSP}g · C 0${NBSP}g · G 0${NBSP}g`,
    );
  });

  it("no usa espacio común entre número y unidad ni punto decimal", () => {
    const line = formatMacrosLine(totals);
    expect(line).not.toMatch(/\d (kcal|g)\b/);
    expect(line).not.toContain("92.5");
  });
});

describe("Atwater (HU-005)", () => {
  const arroz = { protein: 2.4, carbs: 28.6, fat: 0.2 };
  const cerveza = { protein: 0.5, carbs: 3.6, fat: 0, alcohol: 3.9 };

  it("atwaterKcal: 4·P + 4·CHO + 9·G + 7·alcohol, a 2 decimales", () => {
    expect(atwaterKcal(arroz)).toBe(125.8);
    expect(atwaterKcal(cerveza)).toBe(43.7);
    expect(atwaterKcal({ ...arroz, alcohol: null })).toBe(125.8);
    expect(atwaterKcal({ protein: 10, carbs: 60, fat: 15 })).toBe(415);
  });

  it("desglose de 100 g de arroz hervido", () => {
    const b = atwaterBreakdown(arroz);
    expect(b.grams).toBe(100);
    expect(b.parts.map((p) => p.key)).toEqual(["protein", "carbs", "fat"]);
    expect(b.parts.map((p) => p.kcal)).toEqual([9.6, 114.4, 1.8]);
    expect(b.parts.map((p) => p.factor)).toEqual([4, 4, 9]);
    expect(b.totalKcal).toBe(125.8);
  });

  it("desglose de 150 g de arroz hervido", () => {
    const b = atwaterBreakdown(arroz, 150);
    expect(b.parts.map((p) => Math.round(p.grams * 100) / 100)).toEqual([3.6, 42.9, 0.3]);
    expect(b.parts.map((p) => p.kcal)).toEqual([14.4, 171.6, 2.7]);
    expect(b.totalKcal).toBe(188.7);
  });

  it("0 g (o negativo) da todo en 0", () => {
    for (const g of [0, -5]) {
      const b = atwaterBreakdown(arroz, g);
      expect(b.grams).toBe(0);
      expect(b.totalKcal).toBe(0);
      expect(b.parts.every((p) => p.kcal === 0 && p.grams === 0)).toBe(true);
    }
  });

  it("alcohol aparece como parte solo si es > 0", () => {
    const b = atwaterBreakdown(cerveza);
    expect(b.parts.map((p) => p.short)).toEqual(["P", "CHO", "G", "Alc"]);
    expect(b.parts[3]!.kcal).toBe(27.3);
    expect(formatAtwaterCompact(b)).toMatch(/ · Alc 27,3 kcal$/);
  });

  it("formatea partes y el compacto", () => {
    const b = atwaterBreakdown(arroz);
    expect(b.parts.map(formatAtwaterPart)).toEqual([
      "Proteínas 2,4 g × 4 = 9,6 kcal",
      "Carbohidratos 28,6 g × 4 = 114,4 kcal",
      "Grasas 0,2 g × 9 = 1,8 kcal",
    ]);
    expect(formatAtwaterCompact(atwaterBreakdown(arroz, 150))).toBe(
      "P 14,4 kcal · CHO 171,6 kcal · G 2,7 kcal",
    );
  });

  it("formatKcalOneDecimal", () => {
    expect(formatKcalOneDecimal(1234.56)).toBe("1.234,6 kcal");
    expect(formatKcalOneDecimal(125.8)).toBe("125,8 kcal");
    expect(formatKcalOneDecimal(415)).toBe("415 kcal");
  });

  it("kcalDiffersFromAtwater", () => {
    expect(kcalDiffersFromAtwater(130, { protein: 2.7, carbs: 28, fat: 0.3 })).toBe(true);
    expect(kcalDiffersFromAtwater(125.8, arroz)).toBe(false);
    expect(kcalDiffersFromAtwater(125.81, arroz)).toBe(false);
  });

  it("validateOwnFoodMacros", () => {
    expect(validateOwnFoodMacros({ protein: 10, carbs: 60, fat: null })).toEqual(["MISSING_MACROS"]);
    expect(validateOwnFoodMacros({ protein: 50, carbs: 40, fat: 15 })).toEqual(["MACROS_OVER_100"]);
    expect(validateOwnFoodMacros({ protein: 10, carbs: 60, fat: 15, fiber: 5 })).toEqual([]);
    expect(validateOwnFoodMacros({ protein: 60, carbs: 30, fat: 5, fiber: 3, alcohol: 3 })).toEqual([
      "MACROS_OVER_100",
    ]);
    expect(validateOwnFoodMacros({ protein: 0, carbs: 100, fat: 0 })).toEqual([]);
  });
});
