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

  it("HU-018b: sin los campos del menú semanal usa los defaults", () => {
    const [meal] = toMealView([{ id: "m", name: "Almuerzo", items: [{
      id: "i", foodId: null, customLabel: "Fruta", quantityGrams: null, notes: null, food: null,
    }] }]);
    expect(meal).toMatchObject({ mode: "EVERY_DAY", isOptions: false });
    expect(meal?.items[0]?.weekday).toBeNull();
  });
  it("HU-018b: mode, isOptions y weekday llegan a la vista", () => {
    const food = { id: "f", name: "Avena", kcalPer100: "380", proteinPer100: "13", carbsPer100: "60", fatPer100: "7", fiberPer100: "10", alcoholPer100: null };
    const meals = toMealView([
      { id: "d", name: "Desayuno", mode: "PER_DAY", isOptions: false, items: [
        { id: "i1", foodId: "f", food, customLabel: null, quantityGrams: "40", notes: null, weekday: "TUE" },
      ] },
      { id: "c", name: "Colaciones", mode: "EVERY_DAY", isOptions: true, items: [] },
    ]);
    expect(meals.map((m) => [m.mode, m.isOptions])).toEqual([["PER_DAY", false], ["EVERY_DAY", true]]);
    expect(meals[0]?.items[0]).toMatchObject({ weekday: "TUE", macros: { kcal: 152 } });
  });
  it("HU-018b: toMicronutrientItems suma el peso semanal solo si recibe los campos", () => {
    const food = { nutrients: { calcio: 100 }, sodiumMgPer100: null };
    const weekly = toMicronutrientItems([
      { id: "d", mode: "PER_DAY", isOptions: false, items: [
        { id: "a", weekday: "MON", quantityGrams: "100", food },
        { id: "b", weekday: "TUE", quantityGrams: "100", food },
      ] },
      { id: "c", mode: "EVERY_DAY", isOptions: true, items: [
        { id: "o1", weekday: null, quantityGrams: "100", food },
        { id: "o2", weekday: null, quantityGrams: "100", food },
        { id: "o3", weekday: null, quantityGrams: null, food: null },
      ] },
      { id: "e", mode: "EVERY_DAY", isOptions: false, items: [{ id: "x", weekday: null, quantityGrams: "50", food }] },
    ]);
    expect(weekly.map((i) => i.weight)).toEqual([0.5, 0.5, 0.5, 0.5, 0, 1]);
    const legacy = toMicronutrientItems([{ items: [{ quantityGrams: "100", food }] }]);
    expect(legacy[0]).not.toHaveProperty("weight");
  });
});
