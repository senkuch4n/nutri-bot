// HU-018c-2: lo que viaja al cliente del portal no lleva macros de la receta (D3 = b, SDD 7.6).
import { describe, expect, it } from "vitest";
import type { RecipePreview } from "@nutri-bot/db/domain";
import type { MealView } from "@/components/meals-editor";
import { portalMealsForClient, toPortalRecipeMap, toPortalRecipeView } from "./portal-recipe";

const preview: RecipePreview = {
  id: "r1",
  name: "Panqueques",
  status: "PUBLISHED",
  type: "BREAKFAST",
  portionHousehold: "2 panqueques",
  yieldPortions: 4,
  perPortion: { kcal: 255, protein: 12, carbs: 30, fat: 8, fiber: 3 },
  macrosIncomplete: true,
  photo: { id: "ph1", credit: "Ana" },
  sourceName: "Nutriarte",
  preparation: "Mezclar.",
  tips: null,
  ingredients: [{ name: "Avena", household: "1 taza", grams: 80, noQuantity: false }],
};

describe("toPortalRecipeView", () => {
  it("no lleva macros ni estado, y sí todo lo que ve el paciente", () => {
    const v = toPortalRecipeView(preview);
    expect(v).not.toHaveProperty("perPortion");
    expect(v).not.toHaveProperty("macrosIncomplete");
    expect(v).not.toHaveProperty("status");
    expect(JSON.stringify(v)).not.toMatch(/kcal|protein|carbs|"fat"/);
    expect(v).toEqual({
      id: "r1",
      name: "Panqueques",
      type: "BREAKFAST",
      portionHousehold: "2 panqueques",
      yieldPortions: 4,
      photo: { id: "ph1", credit: "Ana" },
      sourceName: "Nutriarte",
      preparation: "Mezclar.",
      tips: null,
      ingredients: [{ name: "Avena", household: "1 taza", grams: 80, noQuantity: false }],
    });
  });
  it("un campo extra que se sume a RecipePreview no viaja", () => {
    const v = toPortalRecipeView({ ...preview, secret: 1 } as RecipePreview);
    expect(v).not.toHaveProperty("secret");
  });
  it("toPortalRecipeMap indexa por id", () => {
    expect(Object.keys(toPortalRecipeMap([preview]))).toEqual(["r1"]);
  });
});

describe("portalMealsForClient", () => {
  const meals: MealView[] = [
    {
      id: "m1",
      name: "Desayuno",
      mode: "PER_DAY",
      isOptions: false,
      items: [
        {
          id: "i1", foodId: null, foodName: null, customLabel: null, quantityGrams: null, notes: null, weekday: "TUE",
          macros: { kcal: 255, protein: 12, carbs: 30, fat: 8, fiber: 3 },
          kcalBreakdown: null,
          recipe: {
            id: "r1", name: "Panqueques", status: "PUBLISHED", type: "BREAKFAST", portions: 1,
            portionHousehold: "2 panqueques", photoId: "ph1", sourceName: "Nutriarte", macrosIncomplete: true,
          },
        },
        {
          id: "i2", foodId: "f1", foodName: "Té", customLabel: null, quantityGrams: "250", notes: null, weekday: "TUE",
          macros: { kcal: 2, protein: 0, carbs: 0, fat: 0, fiber: 0 },
          kcalBreakdown: null,
        },
      ],
    },
  ];

  it("saca los macros de los ítems de receta y deja igual los de alimentos", () => {
    const out = portalMealsForClient(meals);
    const [recipeItem, foodItem] = out[0]!.items;
    expect(recipeItem!.macros).toBeNull();
    expect(recipeItem!.kcalBreakdown).toBeNull();
    expect(recipeItem!.recipe).toMatchObject({ name: "Panqueques", portions: 1, macrosIncomplete: false });
    expect(foodItem).toBe(meals[0]!.items[1]);
  });
  it("no modifica lo que recibe (los totales se calcularon antes con los macros)", () => {
    portalMealsForClient(meals);
    expect(meals[0]!.items[0]!.macros!.kcal).toBe(255);
  });
});
