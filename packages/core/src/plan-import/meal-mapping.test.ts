import { describe, expect, it } from "vitest";
import { MENU_SECTION_MEALS, OPTIONS_MEAL_NAME, matchLunchDinnerLabel, mealNameFor } from "./meal-mapping";

describe("mealNameFor", () => {
  it("numera solo con 2+ tandas", () => {
    expect(mealNameFor("Desayuno", 1, 2)).toBe("Desayuno (1)");
    expect(mealNameFor("Merienda", 2, 2)).toBe("Merienda (2)");
    expect(mealNameFor("Desayuno", 1, 1)).toBe("Desayuno");
  });
});

describe("MENU_SECTION_MEALS", () => {
  it("D7: desayuno y merienda son dos comidas, nunca una combinada", () => {
    expect(MENU_SECTION_MEALS.BREAKFAST_SNACK.map((m) => m.baseName)).toEqual(["Desayuno", "Merienda"]);
    expect(MENU_SECTION_MEALS.LUNCH_DINNER.map((m) => m.baseName)).toEqual(["Almuerzo", "Cena"]);
    const all = Object.values(MENU_SECTION_MEALS).flat().map((m) => m.baseName);
    expect(all).not.toContain("Desayuno y merienda");
    expect(OPTIONS_MEAL_NAME).toBe("Colaciones");
  });
});

describe("matchLunchDinnerLabel", () => {
  it("etiquetas con y sin espacios", () => {
    expect(matchLunchDinnerLabel("Almuerzo y Cena: X")).toEqual({ meals: ["LUNCH", "DINNER"], rest: "X" });
    expect(matchLunchDinnerLabel("Cena:Pollo")).toEqual({ meals: ["DINNER"], rest: "Pollo" });
    expect(matchLunchDinnerLabel("Almuerzo : X")).toEqual({ meals: ["LUNCH"], rest: "X" });
    expect(matchLunchDinnerLabel("Pollo con arroz")).toBeNull();
  });
});
