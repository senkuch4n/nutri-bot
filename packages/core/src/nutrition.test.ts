import { describe, expect, it } from "vitest";
import { computeItemMacros, sumMacros } from "./nutrition";

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
