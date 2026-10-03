// HU-018a-2: lectura de páginas con fixtures SINTÉTICOS (recetas inventadas, D3).
import { describe, expect, it } from "vitest";
import {
  EMPTY_PAGE,
  F1_PAGE,
  F2_PAGE,
  F3_PAGE,
  F4_PAGE,
  F5_INDEX_PAGE,
  F5_INTRO_PAGE,
} from "./__fixtures__/synthetic";
import { extractRecipesFromPages, recipeImportKey } from "./extract";

const FILE = "Recetario de prueba 2_compressed (1).pdf";

describe("extractRecipesFromPages", () => {
  it("F1: nombre en 2 renglones, rinde 8, tabla debajo de las etiquetas, 6 ingredientes y 4 pasos", () => {
    const { drafts, skippedPages } = extractRecipesFromPages([F1_PAGE], { file: FILE });
    expect(skippedPages).toEqual([]);
    expect(drafts).toHaveLength(1);
    const d = drafts[0]!;
    expect(d.name).toBe("Bolitas de mijo");
    expect(d.page).toBe(7);
    expect(d.hints.format).toBe("F1");
    expect(d.hints.warnings).toContain("Título partido en 2 renglones.");
    expect(d.yieldPortions).toBe(8);
    expect(d.hints.yieldText).toBe("Rinde para 8 porciones");
    expect(d.published).toEqual({ portionText: "3 bolitas", kcal: 210, protein: 6.2, carbs: 30.5, fat: 7.1, fiber: 4.03 });
    expect(d.portionHousehold).toBe("3 bolitas");
    expect(d.ingredients.map((i) => [i.label, i.grams])).toEqual([
      ["Mijo", 200],
      ["Zanahoria rallada", 150],
      ["Aceite de girasol", null],
      ["Una cebolla y ajo picados", null],
      ["Orégano", null],
      ["Huevo", null],
    ]);
    expect(d.hints.ingredientFlags).toEqual([[], ["APPROX"], ["VOLUME_ONLY"], ["HOUSEHOLD_ONLY", "MULTI_FOOD"], [], ["HOUSEHOLD_ONLY"]]);
    expect(d.preparation?.split("\n")).toEqual([
      "Hervir el mijo 20 minutos.",
      "Mezclar con la zanahoria y la cebolla rehogada.",
      "Formar bolitas con las manos.",
      "Hornear 25 minutos.",
    ]);
    expect(d.tips).toBe("Se pueden congelar");
    expect(d.rawText).toContain("Bolitas");
  });

  it("F2: títulos rotados; ingredientes y pasos se separan por la franja de cada título", () => {
    const { drafts } = extractRecipesFromPages([F2_PAGE], { file: FILE });
    expect(drafts).toHaveLength(1);
    const d = drafts[0]!;
    expect(d.hints.format).toBe("F2");
    expect(d.name).toBe("Galletas de algarroba");
    expect(d.hints.yieldText).toBe("12 unidades");
    expect(d.yieldPortions).toBeNull(); // "12 unidades" no son porciones
    expect(d.ingredients.map((i) => i.label)).toEqual(["Harina de algarroba", "Avena", "Leche de almendras", "Miel"]);
    expect(d.ingredients.map((i) => i.grams)).toEqual([90, 40, null, null]);
    expect(d.preparation).toBe("Mezclar todo en un bowl.\nHornear 12 minutos a fuego moderado.");
  });

  it("F2 sin títulos: el cambio de viñeta separa ingredientes de pasos", () => {
    const noTitles = { ...F2_PAGE, words: F2_PAGE.words.filter((w) => w.y1 - w.y0 < 100) };
    const { drafts } = extractRecipesFromPages([noTitles], { file: FILE });
    expect(drafts[0]!.ingredients).toHaveLength(4);
    expect(drafts[0]!.preparation?.split("\n")).toHaveLength(2);
    expect(drafts[0]!.hints.warnings.join(" ")).toMatch(/sin título de sección/);
  });

  it("F3: los subtítulos no son ingredientes y quedan como aviso", () => {
    const { drafts } = extractRecipesFromPages([F3_PAGE], { file: FILE });
    const d = drafts[0]!;
    expect(d.ingredients.map((i) => i.label)).toEqual(["Harina integral", "Agua", "Hinojo", "Queso untable"]);
    expect(d.hints.warnings).toContain("Subtítulo «Base».");
    expect(d.hints.warnings).toContain("Subtítulo «Relleno».");
  });

  it("F4: 3 colaciones en una página → 3 borradores con su porción y sin ingredientes", () => {
    const { drafts } = extractRecipesFromPages([F4_PAGE], { file: FILE });
    expect(drafts.map((d) => [d.name, d.portionHousehold])).toEqual([
      ["Bastones de jícama", "una taza"],
      ["Tostada de centeno con tomate", "2 tostadas"],
      ["Uvas congeladas", "15 uvas"],
    ]);
    for (const d of drafts) {
      expect(d.hints.format).toBe("F4");
      expect(d.ingredients).toEqual([]);
      expect(d.page).toBe(4);
    }
    expect(drafts[0]!.preparation).toBe("cortar en tiras y condimentar con limón.");
    expect(new Set(drafts.map((d) => d.importKey)).size).toBe(3);
  });

  it("F5: intro, índice y página vacía → skippedPages con su motivo", () => {
    const { drafts, skippedPages } = extractRecipesFromPages([F5_INTRO_PAGE, F5_INDEX_PAGE, EMPTY_PAGE], { file: FILE });
    expect(drafts).toEqual([]);
    expect(skippedPages).toEqual([
      { page: 1, reason: "NO_RECIPE" },
      { page: 2, reason: "INDEX" },
      { page: 9, reason: "EMPTY" },
    ]);
  });

  it("sugiere tipo, momentos y fuente por el nombre del archivo", () => {
    const { drafts } = extractRecipesFromPages([F1_PAGE], { file: "Almuerzos y cenas 9_compressed.pdf" });
    expect(drafts[0]!.suggestedType).toBe("MAIN_DISH");
    expect(drafts[0]!.suggestedMoments).toEqual(["LUNCH", "DINNER"]);
    expect(drafts[0]!.suggestedSourceName).toBe("Almuerzos y cenas 9");
    const nutri = extractRecipesFromPages([F1_PAGE], { file: "Nutriarte Mate 9.pdf" });
    expect(nutri.drafts[0]!.suggestedSourceName).toBe("Nutriarte — Mate 9");
  });

  it("la misma entrada da la misma importKey; el archivo se normaliza sin sufijos", () => {
    const a = extractRecipesFromPages([F1_PAGE], { file: FILE }).drafts[0]!.importKey;
    const b = extractRecipesFromPages([F1_PAGE], { file: FILE }).drafts[0]!.importKey;
    expect(a).toBe(b);
    expect(a).toBe("recetario-de-prueba-2:p7:bolitas de mijo");
    expect(recipeImportKey("X_compressed (1).pdf", 3, "Tarta")).toBe(recipeImportKey("X.pdf", 3, "Tarta"));
    expect(recipeImportKey("X byn_compressed.pdf", 3, "Tarta")).toBe(recipeImportKey("X.pdf", 3, "Tarta"));
  });

  it("no inventa gramos: todo gramo de un borrador sale de un token en g/kg de su rawText", () => {
    const { drafts } = extractRecipesFromPages([F1_PAGE, F2_PAGE, F3_PAGE, F4_PAGE], { file: FILE });
    const all = drafts.flatMap((d) => d.ingredients);
    expect(all.length).toBeGreaterThan(10);
    for (const i of all) {
      if (i.grams === null) continue;
      expect(i.rawText, i.rawText).toMatch(new RegExp(`(?<![\\d.,])${i.grams}\\s*(?:g|gr|kg)\\b`, "i"));
    }
  });
});
