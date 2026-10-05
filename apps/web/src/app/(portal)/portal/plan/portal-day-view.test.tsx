// HU-017d-3 (SDD 9-3): filas del plan del portal (HTML estático, sin DOM ni base).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MealItemView, MealView } from "@/components/meals-editor";
import type { PortalRecipeView } from "@/lib/portal-recipe";
import { PortalMealCard, PortalMealItems } from "./portal-day-view";

let seq = 0;
const food = (name: string, grams: string, extra: Partial<MealItemView> = {}): MealItemView => ({
  id: `i${++seq}`, foodId: `f${seq}`, foodName: name, customLabel: null, quantityGrams: grams, notes: null,
  macros: { kcal: 120, protein: 10, carbs: 20, fat: 5, fiber: 1 }, kcalBreakdown: null, weekday: null,
  ...extra,
});
const meal = (name: string, mode: MealView["mode"], items: MealItemView[], isOptions = false): MealView => ({
  id: `m${++seq}`, name, mode, isOptions, items,
});

const rice = food("Arroz blanco, hervido", "270", {
  measure: { qty: 1.5, name: "taza", plural: "tazas", gramsPerUnit: 180 },
});
const cheese = food("Queso untable", "37.5");
const recipeItem: MealItemView = {
  ...food("", "0"),
  foodId: null, foodName: null, quantityGrams: null, macros: null,
  recipe: {
    id: "r1", name: "Albóndigas de lentejas", status: "PUBLISHED", type: "MAIN_DISH", portions: 1,
    portionHousehold: "¾ albóndigas", photoId: null, sourceName: "Recetario externo", macrosIncomplete: false,
  },
};
const detail: PortalRecipeView = {
  id: "r1", name: "Albóndigas de lentejas", type: "MAIN_DISH", portionHousehold: "¾ albóndigas", yieldPortions: 4,
  photo: null, sourceName: "Recetario externo", preparation: "Mezclar.", tips: null, ingredients: [],
};

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ");

describe("PortalMealItems", () => {
  it("alimento en medida casera: la medida y los gramos debajo", () => {
    const t = text(renderToStaticMarkup(<PortalMealItems items={[rice]} />));
    expect(t).toContain("Arroz blanco, hervido");
    expect(t).toContain("1½ tazas");
    expect(t).toContain("270 g");
  });

  it("alimento en gramos con decimales: 37,5 g", () => {
    const t = text(renderToStaticMarkup(<PortalMealItems items={[cheese]} />));
    expect(t).toContain("37,5 g");
  });

  it("receta con detalle: un botón con el nombre y Ver receta", () => {
    const html = renderToStaticMarkup(<PortalMealItems items={[recipeItem]} recipes={{ r1: detail }} />);
    const button = html.match(/<button[^>]*>(.*?)<\/button>/)?.[1] ?? "";
    expect(text(button)).toContain("Albóndigas de lentejas");
    // El texto de la porción es el de 018 (recipePortionText, que 017d no cambia).
    expect(text(button)).toContain("1 porción (¾ albóndigas)");
    expect(text(button)).toContain("Fuente: Recetario externo");
    expect(text(button)).toContain("Ver receta");
    expect(html).toContain('aria-haspopup="dialog"');
  });

  it("receta sin detalle: no es tocable ni dice Ver receta", () => {
    const html = renderToStaticMarkup(<PortalMealItems items={[recipeItem]} />);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Ver receta");
    expect(text(html)).toContain("Albóndigas de lentejas");
  });
});

describe("PortalMealCard", () => {
  it("Todos los días va en texto, sin la clase de Badge", () => {
    const m = meal("Desayuno", "EVERY_DAY", [cheese]);
    const html = renderToStaticMarkup(<PortalMealCard meal={m} items={m.items} />);
    expect(html).toContain("Todos los días");
    expect(html).not.toContain("rounded-xs px-2 py-0.5"); // clase de Badge
    expect(html).toMatch(/<h3[^>]*>Desayuno<\/h3>/);
  });

  it("comida de opciones: Elegí una de estas opciones", () => {
    const m = meal("Colación", "EVERY_DAY", [cheese, rice], true);
    const html = renderToStaticMarkup(<PortalMealCard meal={m} items={m.items} />);
    expect(html).toContain("Elegí una de estas opciones");
  });

  it("comida que cambia cada día: sin Todos los días ni opciones", () => {
    const m = meal("Almuerzo", "PER_DAY", [rice]);
    const html = renderToStaticMarkup(<PortalMealCard meal={m} items={m.items} />);
    expect(html).not.toContain("Todos los días");
    expect(html).not.toContain("Elegí una");
  });

  it("no muestra kcal ni macros", () => {
    const m = meal("Almuerzo", "EVERY_DAY", [rice, cheese, recipeItem]);
    const html = renderToStaticMarkup(<PortalMealCard meal={m} items={m.items} recipes={{ r1: detail }} />);
    for (const word of ["kcal", "Proteínas", "Carbohidratos", "Grasas", "Fibra", "Energía"]) {
      expect(html).not.toContain(word);
    }
  });
});
