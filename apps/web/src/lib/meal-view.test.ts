import { describe, expect, it } from "vitest";
import { computePlanMicronutrients } from "@nutri-bot/core";
import { toMealView, toMicronutrientItems } from "./meal-view";

describe("plan micronutrient web adapter", () => {
  it("keeps historical PROPIO ids, labels and available macros visible", () => {
    const meals = toMealView([{ id: "meal", name: "Historical meal", items: [{
      id: "item", foodId: "own-historical", customLabel: null, quantityGrams: "50", notes: null,
      food: { id: "own-historical", name: "Legacy own food", kcalPer100: "200", proteinPer100: "10", carbsPer100: "20", fatPer100: "8", fiberPer100: null, alcoholPer100: null },
    }] }]);
    expect(meals[0]?.items[0]).toMatchObject({ foodId: "own-historical", foodName: "Legacy own food", macros: { kcal: 100, protein: 5, carbs: 10, fat: 4 } });
  });
  it("converts decimal-like values and preserves missing foods and quantities", () => {
    const items = toMicronutrientItems([{ items: [
      { quantityGrams: { toString: () => "50.25" }, food: { nutrients: { calcio: 200 }, sodiumMgPer100: { toString: () => "300" } } },
      { quantityGrams: null, food: { nutrients: null, sodiumMgPer100: null } },
      { quantityGrams: "100", food: null },
    ] }]);
    expect(items[0]?.quantityGrams).toBe(50.25);
    expect(items[0]?.food?.sodiumMgPer100).toBe(300);
    expect(items[1]).toEqual({ quantityGrams: null, food: { nutrients: null, sodiumMgPer100: null } });
    expect(items[2]?.food).toBeNull();
    const result = computePlanMicronutrients(items, { birthDate: new Date("1990-01-01"), sex: "FEMALE" }, new Date("2026-10-02"), "UTC");
    expect(result.nutrients[0]).toMatchObject({ knownAmount: 100.5, adequacyPercent: 10.05, coverage: { knownItems: 1, totalItems: 3, complete: false } });
  });
});
