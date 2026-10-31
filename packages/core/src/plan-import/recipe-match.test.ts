import { describe, expect, it } from "vitest";
import { matchRecipeOption, parseOptionLine, parsePortionQty } from "./recipe-match";

const recipes = [
  { id: "r1", name: "Budín de prueba" },
  { id: "r2", name: "Tarta dulce" },
  { id: "r3", name: "Galletas de avena" },
];

describe("parseOptionLine / parsePortionQty", () => {
  it("separa nombre, cantidad y resto", () => {
    expect(parseOptionLine("Panqueques (2 unidades) con fruta")).toEqual({ name: "Panqueques", qty: "2 unidades", rest: "con fruta" });
    expect(parseOptionLine("Frutas")).toEqual({ name: "Frutas", qty: null, rest: "" });
  });
  it("porciones", () => {
    expect(parsePortionQty("1 porción")).toBe(1);
    expect(parsePortionQty("½ porción")).toBe(0.5);
    expect(parsePortionQty("1/2 porción")).toBe(0.5);
    expect(parsePortionQty("1½ porciones")).toBe(1.5);
    expect(parsePortionQty("1,5 porciones")).toBe(1.5);
    expect(parsePortionQty("5 porciones")).toBeNull();
    expect(parsePortionQty("2 unidades")).toBeNull();
  });
});

describe("matchRecipeOption", () => {
  it("nombre exacto → receta con sus porciones", () => {
    expect(matchRecipeOption("Budín de prueba (1 porción)", recipes)).toEqual({ kind: "RECIPE", recipeId: "r1", portions: 1 });
    expect(matchRecipeOption("budin de PRUEBA", recipes)).toEqual({ kind: "RECIPE", recipeId: "r1", portions: 1 });
    expect(matchRecipeOption("Galletas de avena (½ porción)", recipes)).toEqual({ kind: "RECIPE", recipeId: "r3", portions: 0.5 });
    expect(matchRecipeOption("Galletas de avena (1,5 porciones)", recipes)).toEqual({ kind: "RECIPE", recipeId: "r3", portions: 1.5 });
  });
  it("cantidad que no es porción o fuera de rango → texto con sugerencia", () => {
    expect(matchRecipeOption("Galletas de avena (5 porciones)", recipes)).toEqual({ kind: "TEXT", suggestion: recipes[2] });
    expect(matchRecipeOption("Tarta dulce (2 unidades)", recipes)).toEqual({ kind: "TEXT", suggestion: recipes[1] });
  });
  it("sin receta con ese nombre → texto sin sugerencia", () => {
    expect(matchRecipeOption("Panqueques (2 unidades) con fruta", recipes)).toEqual({ kind: "TEXT", suggestion: null });
    expect(matchRecipeOption("Frutas", recipes)).toEqual({ kind: "TEXT", suggestion: null });
  });
  it("texto después del paréntesis → texto con sugerencia", () => {
    expect(matchRecipeOption("Tarta dulce (1 porción) con té", recipes)).toEqual({ kind: "TEXT", suggestion: recipes[1] });
  });
  it("dos recetas con el mismo nombre normalizado → texto + sugerencia de la primera", () => {
    const dup = [{ id: "a", name: "Budín de prueba" }, { id: "b", name: "budin de prueba" }];
    expect(matchRecipeOption("Budín de prueba (1 porción)", dup)).toEqual({ kind: "TEXT", suggestion: dup[0] });
  });
});
