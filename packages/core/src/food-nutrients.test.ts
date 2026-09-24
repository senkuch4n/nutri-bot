import { describe, expect, it } from "vitest";
import { FOOD_EXTRA_NUTRIENTS, FOOD_NUTRIENT_SECTION_LABELS, readFoodNutrients } from "./food-nutrients";

describe("nutrientes extra", () => {
  it("son 29 definiciones con claves únicas en 5 secciones", () => {
    expect(FOOD_EXTRA_NUTRIENTS).toHaveLength(29);
    expect(new Set(FOOD_EXTRA_NUTRIENTS.map((n) => n.key)).size).toBe(29);
    const sections = new Set(FOOD_EXTRA_NUTRIENTS.map((n) => n.section));
    expect([...sections]).toEqual(["grasas", "carbohidratos", "minerales", "vitaminas", "otros"]);
    expect(Object.keys(FOOD_NUTRIENT_SECTION_LABELS)).toHaveLength(5);
  });

  it("unidades de algunas claves", () => {
    const byKey = Object.fromEntries(FOOD_EXTRA_NUTRIENTS.map((n) => [n.key, n]));
    expect(byKey.potasio!.unit).toBe("mg");
    expect(byKey.vitaminaB12!.unit).toBe("µg");
    expect(byKey.cenizas!.section).toBe("otros");
  });

  it("readFoodNutrients devuelve null si no es un objeto", () => {
    expect(readFoodNutrients(null)).toBeNull();
    expect(readFoodNutrients([1, 2])).toBeNull();
    expect(readFoodNutrients("hola")).toBeNull();
    expect(readFoodNutrients(undefined)).toBeNull();
  });

  it("completa con null las claves faltantes y conserva 0 como 0", () => {
    const n = readFoodNutrients({ calcio: 12.5, hierro: 0, kcalPublicada: 126, basura: 3 });
    expect(n).not.toBeNull();
    expect(n!.calcio).toBe(12.5);
    expect(n!.hierro).toBe(0);
    expect(n!.kcalPublicada).toBe(126);
    expect(n!.potasio).toBeNull();
    expect(Object.keys(n!)).toHaveLength(30);
    expect("basura" in n!).toBe(false);
  });
});
