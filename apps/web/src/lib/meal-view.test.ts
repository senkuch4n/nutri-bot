import { describe, expect, it } from "vitest";
import { computePlanMicronutrients, computeRecipeMacros, recipeItemMacros } from "@nutri-bot/core";
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

  describe("HU-018c: ítems de receta", () => {
    const avena = { name: "Avena, arrollada", group: "LEGUMBRES_CEREALES", kcalPer100: "380", proteinPer100: "13", carbsPer100: "60", fatPer100: "7", fiberPer100: "10", nutrients: { calcio: 50 }, sodiumMgPer100: "2" };
    const banana = { name: "Banana", group: "FRUTAS", kcalPer100: "90", proteinPer100: "1", carbsPer100: "22", fatPer100: "0.3", fiberPer100: "2", nutrients: { calcio: 5 }, sodiumMgPer100: null };
    const recipe = {
      id: "rec1", name: "Panqueques de avena", status: "PUBLISHED" as const, type: "BREAKFAST" as const,
      portionHousehold: "2 panqueques", yieldPortions: { toString: () => "4" }, sourceName: "Nutriarte", photo: { id: "ph1" },
      ingredients: [
        { label: null, grams: "200", noQuantity: false, food: avena },
        { label: null, grams: "240", noQuantity: false, food: banana },
        { label: "Canela", grams: null, noQuantity: true, food: null },
        { label: "Miel casera", grams: "20", noQuantity: false, food: null },
      ],
    };
    const recipeItem = { id: "ri", foodId: null, food: null, customLabel: null, quantityGrams: null, notes: null, weekday: "TUE" as const, recipeId: "rec1", portions: { toString: () => "1.5" }, recipe };

    it("toMealView calcula los macros por porción × porciones y arma la receta", () => {
      const [meal] = toMealView([{ id: "d", name: "Desayuno", mode: "PER_DAY", items: [recipeItem] }]);
      const perPortion = computeRecipeMacros([
        { label: null, grams: 200, noQuantity: false, food: { ...avena, group: "LEGUMBRES_CEREALES", kcalPer100: 380, proteinPer100: 13, carbsPer100: 60, fatPer100: 7, fiberPer100: 10 } },
        { label: null, grams: 240, noQuantity: false, food: { ...banana, group: "FRUTAS", kcalPer100: 90, proteinPer100: 1, carbsPer100: 22, fatPer100: 0.3, fiberPer100: 2 } },
      ], 4).perPortion;
      const view = meal!.items[0]!;
      expect(view.macros).toEqual(recipeItemMacros(perPortion, 1.5));
      expect(view.macros?.kcal).toBe(366); // (760 + 216) / 4 × 1,5
      expect(view).toMatchObject({ foodName: null, customLabel: null, quantityGrams: null, kcalBreakdown: null, weekday: "TUE" });
      expect(view.recipe).toEqual({
        id: "rec1", name: "Panqueques de avena", status: "PUBLISHED", type: "BREAKFAST", portions: 1.5,
        portionHousehold: "2 panqueques", photoId: "ph1", sourceName: "Nutriarte", macrosIncomplete: true,
      });
    });

    it("toMicronutrientItems expande la receta a sus ingredientes escalados, con el peso semanal", () => {
      const items = toMicronutrientItems([
        { id: "d", mode: "PER_DAY", isOptions: false, items: [
          recipeItem,
          { id: "x", weekday: "WED", quantityGrams: "100", food: { nutrients: { calcio: 10 }, sodiumMgPer100: null } },
        ] },
      ]);
      // 2 días cargados → cada ítem pesa ½. El c.n. no aparece; el de texto libre aparece sin alimento.
      expect(items).toEqual([
        { quantityGrams: 75, food: { nutrients: { calcio: 50 }, sodiumMgPer100: 2 }, weight: 0.5 },
        { quantityGrams: 90, food: { nutrients: { calcio: 5 }, sodiumMgPer100: null }, weight: 0.5 },
        { quantityGrams: 7.5, food: null, weight: 0.5 },
        { quantityGrams: 100, food: { nutrients: { calcio: 10 }, sodiumMgPer100: null }, weight: 0.5 },
      ]);
    });

    it("sin rendimiento la receta no aporta ni cuenta como ítem con macros", () => {
      const noYield = { ...recipeItem, recipe: { ...recipe, yieldPortions: null } };
      const [meal] = toMealView([{ id: "d", name: "Desayuno", items: [noYield] }]);
      expect(meal!.items[0]!.macros).toBeNull();
      expect(toMicronutrientItems([{ items: [noYield] }])).toEqual([]);
    });
  });

  describe("HU-018d: medida casera", () => {
    const food = { id: "f", name: "Arroz blanco, hervido", kcalPer100: "130", proteinPer100: "2.7", carbsPer100: "28", fatPer100: "0.3", fiberPer100: "0.4", alcoholPer100: null };
    const dec = (v: string) => ({ toString: () => v });
    const gramsItem = { id: "g", foodId: "f", food, customLabel: null, quantityGrams: dec("270.00"), notes: null, weekday: "TUE" as const };
    const measureItem = {
      ...gramsItem, id: "m",
      measureQty: dec("1.50"), measureName: "taza", measurePlural: "tazas", measureGrams: dec("180.0"),
    };

    it("un ítem con medida trae la medida en números y los mismos macros que en gramos", () => {
      const [meal] = toMealView([{ id: "a", name: "Almuerzo", mode: "PER_DAY", items: [measureItem, gramsItem] }]);
      const [withMeasure, inGrams] = meal!.items;
      expect(withMeasure!.measure).toEqual({ qty: 1.5, name: "taza", plural: "tazas", gramsPerUnit: 180 });
      expect(inGrams!.measure).toBeNull();
      expect(withMeasure!.macros).toEqual(inGrams!.macros);
      expect(withMeasure!.quantityGrams).toBe("270");
    });

    it("con un campo faltante queda como ítem en gramos", () => {
      const [meal] = toMealView([{ id: "a", name: "Almuerzo", items: [{ ...measureItem, measurePlural: null }] }]);
      expect(meal!.items[0]!.measure).toBeNull();
    });
  });
});
