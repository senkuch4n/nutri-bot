// HU-018a-2: selección de archivos, sugerencia de alimento y bundle. Catálogo y recetas INVENTADOS.
import { describe, expect, it } from "vitest";
import { foodSearchText } from "../food-search";
import { validateRecipeBundle, type RecipeBundle } from "./bundle";
import { isExcludedRecipeFile, pickRecipeFiles, recipeFileTitle, suggestFromFileName } from "./files";
import { suggestFood, type SuggestableFood } from "./food-suggest";

describe("files", () => {
  it("excluye reemplazos, conservación (D20) y los PPTX", () => {
    expect(isExcludedRecipeFile("Reemplazos (2).pdf").excluded).toBe(true);
    expect(isExcludedRecipeFile("conservacion de verduras en el freezer byn_compressed.pdf").excluded).toBe(true);
    expect(isExcludedRecipeFile("Conservación.pdf").excluded).toBe(true);
    expect(isExcludedRecipeFile("Box de platos.pptx")).toEqual({ excluded: true, reason: expect.stringMatching(/PPTX/) });
    expect(isExcludedRecipeFile("Colaciones_compressed.pdf")).toEqual({ excluded: false, reason: null });
  });

  it("saca el «byn» que tiene versión a color y deja el que no tiene", () => {
    const { use, skipped } = pickRecipeFiles([
      "Colaciones byn_compressed.pdf",
      "Colaciones_compressed.pdf",
      "panes y pizzas byn_compressed.pdf",
      "Reemplazos (2).pdf",
      "Box de platos.pptx",
    ]);
    expect(use).toEqual(["Colaciones_compressed.pdf", "panes y pizzas byn_compressed.pdf"]);
    expect(skipped.map((s) => s.file).sort()).toEqual(["Box de platos.pptx", "Colaciones byn_compressed.pdf", "Reemplazos (2).pdf"]);
  });

  it("sugiere tipo y momentos por el nombre (tabla 8.1) y un título legible", () => {
    expect(suggestFromFileName("almuerzos y cenas 3_compressed (1).pdf")).toEqual({
      type: "MAIN_DISH",
      moments: ["LUNCH", "DINNER"],
      title: "Almuerzos y cenas 3",
    });
    expect(suggestFromFileName("Guarnis de verdura.pdf").type).toBe("SIDE_DISH");
    expect(suggestFromFileName("Picoteo saludable.pdf")).toMatchObject({ type: "SNACK", moments: ["SNACK"] });
    expect(suggestFromFileName("pizzas y panes byn.pdf").moments).toEqual(["BREAKFAST", "AFTERNOON_SNACK", "DINNER"]);
    expect(suggestFromFileName("Fiestas saludables (1).pdf")).toMatchObject({ type: null, moments: [] });
    expect(recipeFileTitle("mate 1 ÚLTIMO.pdf")).toBe("Mate 1");
  });
});

const food = (id: string, name: string, source: "SARA2" | "PROPIO" = "SARA2", active = true): SuggestableFood => ({
  id,
  name,
  searchText: foodSearchText(name),
  source,
  active,
});

const CATALOG: SuggestableFood[] = [
  food("lent", "Lentejas, secas, crudas"),
  food("lentchoc", "Lentejas de chocolate de fantasía"),
  food("zap", "Zapallo, hervido"),
  food("ajo", "Ajo"),
  food("oliva-p", "Aceite de oliva", "PROPIO"),
  food("oliva-s", "Aceite de oliva", "SARA2"),
  food("kiwi-old", "Kiwi", "SARA2", false),
  food("zana", "Zanahoria, cruda"),
];

describe("suggestFood", () => {
  it("«Lentejas» encuentra «Lentejas, secas, crudas»", () => {
    expect(suggestFood("Lentejas", CATALOG)).toEqual({ foodId: "lent", matchedQuery: "lentejas" });
  });
  it("«Puré de calabaza» llega a zapallo por sinónimo", () => {
    expect(suggestFood("Puré de calabaza", CATALOG)?.foodId).toBe("zap");
  });
  it("«Dientes de ajo» encuentra «Ajo»", () => {
    expect(suggestFood("Dientes de ajo", CATALOG)?.foodId).toBe("ajo");
  });
  it("plural → singular («Zanahorias ralladas»)", () => {
    expect(suggestFood("Zanahorias ralladas", CATALOG)?.foodId).toBe("zana");
  });
  it("una palabra que no está en el catálogo da null", () => {
    expect(suggestFood("Quimbombó", CATALOG)).toBeNull();
    expect(suggestFood("", CATALOG)).toBeNull();
  });
  it("a igual ranking gana SARA2 sobre PROPIO", () => {
    expect(suggestFood("Aceite de oliva", CATALOG)?.foodId).toBe("oliva-s");
  });
  it("los alimentos inactivos se ignoran", () => {
    expect(suggestFood("Kiwi", CATALOG)).toBeNull();
  });
});

function validBundle(): RecipeBundle {
  return {
    format: 1,
    exportedAt: "2026-10-03T12:00:00.000Z",
    recipes: [
      {
        importKey: "recetario-inventado:p3:bolitas de mijo",
        name: "Bolitas de mijo",
        origin: "IMPORT",
        type: "MAIN_DISH",
        moments: ["LUNCH"],
        tags: ["VEGETARIAN"],
        yieldPortions: 8,
        portionHousehold: "3 bolitas",
        portionGrams: null,
        preparation: "Mezclar.",
        tips: null,
        sourceName: "Recetario inventado",
        published: { portionText: "3 bolitas", kcal: 210, protein: null, carbs: null, fat: null, fiber: null },
        importFile: "Recetario inventado.pdf",
        importPage: 3,
        ingredients: [
          { order: 0, label: null, grams: 200, noQuantity: false, household: null, rawText: "Mijo 200g", food: { sourceKey: "sara2:t01:mijo" } },
          {
            order: 1,
            label: "Mix propio",
            grams: 50,
            noQuantity: false,
            household: null,
            rawText: null,
            food: { ownName: "Mix propio", per100: { kcal: 400, protein: 10, carbs: 50, fat: 15, fiber: 5 } },
          },
          { order: 2, label: "Sal", grams: null, noQuantity: true, household: null, rawText: null, food: null },
        ],
        photo: { dataBase64: "UklGRg==", thumbBase64: "UklGRg==", credit: null },
      },
    ],
  };
}

describe("validateRecipeBundle", () => {
  it("acepta un bundle válido", () => {
    const r = validateRecipeBundle(JSON.parse(JSON.stringify(validBundle())));
    expect(r.ok).toBe(true);
  });
  it("rechaza formato ≠ 1", () => {
    const r = validateRecipeBundle({ ...validBundle(), format: 2 });
    expect(r).toEqual({ ok: false, errors: [expect.stringMatching(/^format/)] });
  });
  it("rechaza recetas sin importKey y claves repetidas", () => {
    const b = validBundle();
    const r = validateRecipeBundle({ ...b, recipes: [{ ...b.recipes[0]!, importKey: "" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("recipes[0].importKey: falta");
    const dup = validateRecipeBundle({ ...b, recipes: [b.recipes[0]!, b.recipes[0]!] });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.errors).toContain("recipes[1].importKey: repetida");
  });
  it("rechaza ingredientes con food mal formado", () => {
    const b = validBundle();
    const bad = { ...b.recipes[0]!, ingredients: [{ ...b.recipes[0]!.ingredients[0]!, food: { id: "x" } }] };
    const r = validateRecipeBundle({ ...b, recipes: [bad] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/ingredients\[0\]\.food/);
    const noMacros = { ...b.recipes[0]!, ingredients: [{ ...b.recipes[0]!.ingredients[1]!, food: { ownName: "X", per100: { kcal: 1 } } }] };
    expect(validateRecipeBundle({ ...b, recipes: [noMacros] }).ok).toBe(false);
  });
  it("rechaza base64 inválido en la foto", () => {
    const b = validBundle();
    const bad = { ...b.recipes[0]!, photo: { dataBase64: "no es base64!", thumbBase64: "UklGRg==", credit: null } };
    const r = validateRecipeBundle({ ...b, recipes: [bad] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("recipes[0].photo: base64 inválido");
  });
  it("rechaza tipo y momentos fuera del catálogo y un rendimiento 0", () => {
    const b = validBundle();
    const bad = { ...b.recipes[0]!, type: "SOPA", moments: ["BRUNCH"], yieldPortions: 0 };
    const r = validateRecipeBundle({ ...b, recipes: [bad] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual(expect.arrayContaining(["recipes[0].type: inválido", "recipes[0].moments: inválido"]));
  });
});
