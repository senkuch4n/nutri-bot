import { describe, expect, it } from "vitest";
import { computeItemMacros, formatMacroAmount, formatMacrosLine, sumMacros } from "./nutrition";

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
