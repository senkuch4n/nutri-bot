import { describe, expect, it } from "vitest";
import { foodNameCompareKey, foodSearchText, matchesFoodQuery, searchFoods } from "./food-search";

const make = (names: string[]) => names.map((name) => ({ name, searchText: foodSearchText(name) }));

describe("búsqueda de alimentos", () => {
  it("foodSearchText saca tildes, mayúsculas y puntuación", () => {
    expect(foodSearchText("Limón, crudo")).toBe("limon crudo");
    expect(foodSearchText("  Ají verde o amarillo / morrón  ")).toBe("aji verde o amarillo morron");
    expect(foodSearchText("Leche 50% más")).toBe("leche 50% mas");
  });

  it("matchesFoodQuery ignora tildes y mayúsculas y pide todas las palabras", () => {
    const limon = foodSearchText("Limón");
    expect(matchesFoodQuery(limon, "limon")).toBe(true);
    expect(matchesFoodQuery(limon, "LIMÓN")).toBe(true);
    expect(matchesFoodQuery(foodSearchText("Arroz blanco, hervido"), "arroz hervido")).toBe(true);
    expect(matchesFoodQuery(foodSearchText("Arroz blanco, crudo"), "arroz hervido")).toBe(false);
    expect(matchesFoodQuery(limon, "")).toBe(true);
  });

  it("ordena: empieza con la consulta, después palabra que empieza, después el resto", () => {
    const foods = make([
      "Leche de arroz",
      "Galletitas de arroz",
      "Arroz blanco, hervido",
      "Arroz blanco, crudo",
      "Arroz",
      "Harina de maíz",
      "Barroza (prueba)",
    ]);
    const names = searchFoods(foods, "arroz").map((f) => f.name);
    expect(names.slice(0, 3)).toEqual(["Arroz", "Arroz blanco, crudo", "Arroz blanco, hervido"]);
    expect(names.indexOf("Leche de arroz")).toBeGreaterThan(2);
    expect(names.at(-1)).toBe("Barroza (prueba)");
    expect(names).not.toContain("Harina de maíz");
  });

  it("respeta el límite y con consulta vacía devuelve todos", () => {
    const foods = make(Array.from({ length: 30 }, (_, i) => `Arroz ${i}`));
    expect(searchFoods(foods, "arroz", 20)).toHaveLength(20);
    expect(searchFoods(foods, "")).toHaveLength(30);
  });

  it("foodNameCompareKey iguala espacios, mayúsculas y tildes", () => {
    expect(foodNameCompareKey("Yogur  Descremado")).toBe(foodNameCompareKey("yogur descremado"));
    expect(foodNameCompareKey("Acelga, cruda")).toBe(foodNameCompareKey("acelga cruda"));
    expect(foodNameCompareKey("Arroz blanco cocido")).not.toBe(foodNameCompareKey("Arroz blanco"));
  });
});
