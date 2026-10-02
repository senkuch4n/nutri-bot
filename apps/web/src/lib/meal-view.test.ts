import { describe, expect, it } from "vitest";
import { computePlanMicronutrients } from "@nutri-bot/core";
import { toMicronutrientItems } from "./meal-view";

describe("plan micronutrient web adapter", () => {
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
