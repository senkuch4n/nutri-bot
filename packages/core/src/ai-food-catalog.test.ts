import { describe, expect, it } from "vitest";
import { buildAiFoodCatalog, type AiCatalogFood } from "./ai-food-catalog";

const foods: AiCatalogFood[] = [
  { id: "a1", name: "Arroz blanco, hervido", group: "LEGUMBRES_CEREALES", kcalPer100: 125.8 },
  { id: "b2", name: "Hamburguesa | doble", group: "COMIDAS_RAPIDAS", kcalPer100: 250.4 },
  { id: "c3", name: "Caramelos", group: "GOLOSINAS_Y_CHOCOLATES", kcalPer100: 390 },
  { id: "d4", name: "Limón", group: "FRUTAS", kcalPer100: 29.5 },
];

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
