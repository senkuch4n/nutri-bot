import { describe, expect, it } from "vitest";
import { buildAiFoodCatalog, selectAiCatalogFoods, type AiCatalogFood } from "./ai-food-catalog";
import type { FoodSourceKey } from "./food-groups";

const foods: AiCatalogFood[] = [
  { id: "a1", name: "Arroz blanco, hervido", group: "LEGUMBRES_CEREALES", kcalPer100: 125.8 },
  { id: "b2", name: "Hamburguesa | doble", group: "COMIDAS_RAPIDAS", kcalPer100: 250.4 },
  { id: "c3", name: "Caramelos", group: "GOLOSINAS_Y_CHOCOLATES", kcalPer100: 390 },
  { id: "d4", name: "Limón", group: "FRUTAS", kcalPer100: 29.5 },
];

describe("AI-only food source selection", () => {
  const mixed: (AiCatalogFood & { source: FoodSourceKey })[] = foods.map((food, index) => ({
    ...food, source: index % 2 === 0 ? "PROPIO" : "SARA2",
  }));

  it("uses only SARA2 when both sources are available, preserving order and refs", () => {
    const selected = selectAiCatalogFoods(mixed);
    const catalog = buildAiFoodCatalog(selected);
    expect(selected.map((food) => food.source)).toEqual(["SARA2", "SARA2"]);
    expect(catalog.idsByRef).toEqual(["b2", "d4"]);
    expect(catalog.text.split("\n")).toEqual([
      "1|Hamburguesa / doble|Comidas rápidas|250",
      "2|Limón|Frutas|30",
    ]);
    expect(catalog.idsByRef[2 - 1]).toBe("d4");
  });

  it("returns an empty catalog rather than falling back to PROPIO", () => {
    const own = mixed.filter((food) => food.source === "PROPIO");
    const selected = selectAiCatalogFoods(own);
    expect(selected).toEqual([]);
    const catalog = buildAiFoodCatalog(selected);
    expect(catalog.idsByRef).toEqual([]);
    expect(catalog.text).toBe("");
  });

  it("preserves ref resolution when catalog size exclusions renumber SARA2 foods", () => {
    const catalog = buildAiFoodCatalog(selectAiCatalogFoods(mixed), { maxChars: 30 });
    expect(catalog.excludedGroups).toEqual(["COMIDAS_RAPIDAS"]);
    expect(catalog.text).toBe("1|Limón|Frutas|30");
    expect(catalog.idsByRef[1 - 1]).toBe("d4");
  });

  it("does not modify the mixed food list retained for manual selection", () => {
    const original = mixed.map((food) => ({ ...food }));
    const manualFoods = Object.freeze(mixed.map((food) => Object.freeze({ ...food })));
    selectAiCatalogFoods(manualFoods);
    expect(manualFoods).toEqual(original);
    expect(manualFoods.map((food) => food.id)).toEqual(["a1", "b2", "c3", "d4"]);
  });

  it("keeps an empty input empty", () => {
    expect(selectAiCatalogFoods([])).toEqual([]);
  });
});

describe("catálogo compacto para la IA", () => {
  it("una línea por alimento con ref, nombre, grupo corto y kcal enteras", () => {
    const r = buildAiFoodCatalog(foods);
    const lines = r.text.split("\n");
    expect(lines[0]).toBe("1|Arroz blanco, hervido|Cereales, papa, pan y pastas|126");
    expect(lines[1]).toBe("2|Hamburguesa / doble|Comidas rápidas|250");
    expect(lines[3]).toBe("4|Limón|Frutas|30");
    expect(r.idsByRef).toEqual(["a1", "b2", "c3", "d4"]);
    expect(r.excludedGroups).toEqual([]);
  });

  it("si no entra, saca grupos excluibles de a uno y renumera", () => {
    const full = buildAiFoodCatalog(foods).text.length;
    const r = buildAiFoodCatalog(foods, { maxChars: full - 10 });
    expect(r.excludedGroups).toEqual(["COMIDAS_RAPIDAS"]);
    expect(r.idsByRef).toEqual(["a1", "c3", "d4"]);
    expect(r.text.split("\n")[1]).toBe("2|Caramelos|Golosinas|390");

    const tiny = buildAiFoodCatalog(foods, { maxChars: 10 });
    expect(tiny.excludedGroups).toEqual(["COMIDAS_RAPIDAS", "GOLOSINAS_Y_CHOCOLATES"]);
    expect(tiny.idsByRef).toEqual(["a1", "d4"]);
  });
});
