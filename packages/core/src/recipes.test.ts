import { describe, expect, it } from "vitest";
import { computeItemMacros, sumMacros, type Macros } from "./nutrition";
import {
  EMPTY_RECIPE_FILTERS,
  RECIPE_TEXT,
  RECIPE_TAG_LABELS,
  RECIPE_TYPE_LABELS,
  compareWithPublished,
  computeRecipeMacros,
  filterRecipes,
  formatPortions,
  hasActiveRecipeFilters,
  ingredientDisplayName,
  joinListEs,
  normalizePortions,
  recipeCountText,
  recipeItemMacros,
  recipeMacroWarnings,
  recipeSearchText,
  recipeUsageWarning,
  scaleMacros,
  stepPortions,
  validateRecipeForPublish,
  type RecipeIngredientForMacros,
  type RecipeMomentKey,
  type RecipePublishCheck,
  type RecipeTagKey,
  type RecipeTypeKey,
} from "./recipes";

// Alimentos ficticios (valores inventados por 100 g).
const LENTEJAS = { name: "Lentejas, secas, crudas", group: "LEGUMBRES_CEREALES" as const, kcalPer100: 340, proteinPer100: 24, carbsPer100: 50, fatPer100: 1.5, fiberPer100: 11 };
const ZAPALLO = { name: "Zapallo, hervido", group: "VERDURAS" as const, kcalPer100: 26, proteinPer100: 1, carbsPer100: 5.5, fatPer100: 0.1, fiberPer100: 1.5 };
const ARROZ = { name: "Arroz blanco, hervido", group: "LEGUMBRES_CEREALES" as const, kcalPer100: 130, proteinPer100: 2.7, carbsPer100: 28, fatPer100: 0.3, fiberPer100: 0.4 };
const PEREJIL = { name: "Perejil, fresco", group: "VERDURAS" as const, kcalPer100: 36, proteinPer100: 3, carbsPer100: 6, fatPer100: 0.8, fiberPer100: 3.3 };
const ACEITE = { name: "Aceite de oliva", group: "ACEITES" as const, kcalPer100: 884, proteinPer100: 0, carbsPer100: 0, fatPer100: 100, fiberPer100: 0 };

const ing = (food: RecipeIngredientForMacros["food"], grams: number | null, extra: Partial<RecipeIngredientForMacros> = {}): RecipeIngredientForMacros => ({
  label: null, grams, noQuantity: false, food, ...extra,
});

describe("computeRecipeMacros", () => {
  const gherkin = [
    ing(LENTEJAS, 500),
    ing(ZAPALLO, 300),
    ing(ARROZ, 70),
    ing(PEREJIL, null, { noQuantity: true, label: "Perejil" }),
  ];

  it("suma los ingredientes y divide por el rendimiento (receta del Gherkin)", () => {
    const r = computeRecipeMacros(gherkin, 8);
    // 500 g lentejas: 1700 kcal, P 120, C 250, G 7.5, F 55
    // 300 g zapallo: 78 kcal, P 3, C 16.5, G 0.3, F 4.5
    // 70 g arroz: 91 kcal, P 1.89, C 19.6, G 0.21, F 0.28
    expect(r.total).toEqual({ kcal: 1869, protein: 124.9, carbs: 286.1, fat: 8, fiber: 59.8 });
    expect(r.perPortion).toEqual({ kcal: 233.6, protein: 15.6, carbs: 35.8, fat: 1, fiber: 7.5 });
    expect(r.estimatedPortionGrams).toBe(109); // 870 / 8 = 108.75
    expect(r.noQuantity).toEqual({ names: ["Perejil"], caloricNames: [] });
    expect(r.missingGrams.names).toEqual([]);
    expect(r.freeText.names).toEqual([]);
  });

  it("no acumula el redondeo por ítem", () => {
    const a = { ...ZAPALLO, name: "A", kcalPer100: 10.05, proteinPer100: 0.15, carbsPer100: 0.15, fatPer100: 0.15, fiberPer100: 0.15 };
    const items = [ing(a, 33), ing(a, 33), ing(a, 33)];
    const r = computeRecipeMacros(items, 1);
    // sin redondear: 3 × 3.3165 = 9.9495 → 9.9; sumando redondeos por ítem: 3 × 3.3 = 9.9 (kcal)
    // proteína: 3 × 0.0495 = 0.1485 → 0.1; por ítem: 3 × 0 = 0
    const perItem = sumMacros(items.map((i) => computeItemMacros(i.food!, i.grams!)));
    expect(perItem.protein).toBe(0);
    expect(r.total.protein).toBe(0.1);
    expect(r.total.kcal).toBe(9.9);
  });

  it("sin rendimiento: sin perPortion ni Atwater y aviso warnNoYield", () => {
    const r = computeRecipeMacros(gherkin, null);
    expect(r.perPortion).toBeNull();
    expect(r.atwaterPerPortion).toBeNull();
    expect(r.estimatedPortionGrams).toBeNull();
    expect(r.total.kcal).toBe(1869);
    expect(recipeMacroWarnings(r, null)).toContain(RECIPE_TEXT.warnNoYield);
    expect(recipeMacroWarnings(computeRecipeMacros(gherkin, 0), 0)).toContain(RECIPE_TEXT.warnNoYield);
  });

  it("c.n. sin grupos calóricos: textos de uno y de varios", () => {
    const one = computeRecipeMacros([ing(LENTEJAS, 100), ing(PEREJIL, null, { noQuantity: true })], 2);
    expect(recipeMacroWarnings(one, 2)).toEqual(["1 ingrediente sin cantidad: no suma a los macros"]);
    const many = computeRecipeMacros(
      [ing(LENTEJAS, 100), ing(PEREJIL, null, { noQuantity: true }), ing(null, null, { label: "Sal", noQuantity: true })],
      2,
    );
    expect(recipeMacroWarnings(many, 2)).toEqual(["2 ingredientes sin cantidad: no suman a los macros"]);
  });

  it("c.n. con aceite: texto calórico exacto", () => {
    const r = computeRecipeMacros(
      [ing(LENTEJAS, 100), ing(PEREJIL, null, { noQuantity: true, label: "Perejil" }), ing(ACEITE, null, { noQuantity: true })],
      4,
    );
    expect(r.noQuantity.caloricNames).toEqual(["Aceite de oliva"]);
    expect(recipeMacroWarnings(r, 4)).toEqual([
      "Perejil y aceite de oliva sin cantidad: aceite de oliva puede sumar muchas kcal",
    ]);
  });

  it("varios calóricos c.n.: 'pueden'", () => {
    const manteca = { ...ACEITE, name: "Manteca", group: "GRASAS" as const };
    const r = computeRecipeMacros([ing(ACEITE, null, { noQuantity: true }), ing(manteca, null, { noQuantity: true })], 1);
    expect(recipeMacroWarnings(r, 1)).toEqual([
      "Aceite de oliva y manteca sin cantidad: aceite de oliva y manteca pueden sumar muchas kcal",
    ]);
  });

  it("texto libre: no suma macros pero sí gramos estimados", () => {
    const r = computeRecipeMacros([ing(LENTEJAS, 100), ing(null, 100, { label: "Pan rallado" })], 2);
    expect(r.total.kcal).toBe(340);
    expect(r.freeText.names).toEqual(["Pan rallado"]);
    expect(r.estimatedPortionGrams).toBe(100);
    expect(recipeMacroWarnings(r, 2)).toEqual([RECIPE_TEXT.warnFreeText]);
  });

  it("alimento sin gramos ni c.n. → missingGrams (grams 0 = sin gramos)", () => {
    const r = computeRecipeMacros([ing(LENTEJAS, null), ing(ZAPALLO, 0), ing(ARROZ, 100)], 1);
    expect(r.missingGrams.names).toEqual(["Lentejas", "Zapallo"]);
    expect(r.total.kcal).toBe(130);
    expect(recipeMacroWarnings(r, 1)[0]).toBe(
      "Falta el gramo de 2 ingredientes: completalo o marcá «Sin cantidad (c.n.)».",
    );
  });

  it("ignora filas vacías (sin alimento ni texto)", () => {
    const r = computeRecipeMacros([ing(null, null, { label: "  " }), ing(LENTEJAS, 100)], 1);
    expect(r.freeText.names).toEqual([]);
    expect(r.total.kcal).toBe(340);
  });

  it("Atwater por porción: P×4, CHO×4, G×9 y totalKcal = perPortion.kcal", () => {
    const r = computeRecipeMacros([ing(LENTEJAS, 400)], 4);
    const a = r.atwaterPerPortion!;
    expect(a.parts.map((p) => [p.short, p.factor, p.kcal])).toEqual([
      ["P", 4, 96],
      ["CHO", 4, 200],
      ["G", 9, 13.5],
    ]);
    expect(a.totalKcal).toBe(r.perPortion!.kcal);
    expect(a.totalKcal).toBe(340);
    expect(a.grams).toBe(100);
  });
});

describe("ingredientDisplayName", () => {
  it("usa el label si tiene texto; si no, corta el nombre del alimento en la primera coma", () => {
    expect(ingredientDisplayName({ label: "Puré de calabaza", food: ZAPALLO })).toBe("Puré de calabaza");
    expect(ingredientDisplayName({ label: "  ", food: LENTEJAS })).toBe("Lentejas");
    expect(ingredientDisplayName({ label: null, food: { name: "Ajo" } })).toBe("Ajo");
    expect(ingredientDisplayName({ label: null, food: null })).toBe("");
  });
});

describe("joinListEs", () => {
  it("une con coma e y", () => {
    expect(joinListEs(["a"])).toBe("a");
    expect(joinListEs(["a", "b"])).toBe("a y b");
    expect(joinListEs(["a", "b", "c"])).toBe("a, b y c");
  });
});

describe("porciones", () => {
  it("normalizePortions", () => {
    for (const v of [0.5, 1, 1.5, 4]) expect(normalizePortions(v)).toBe(v);
    for (const v of [0, 0.25, 4.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(normalizePortions(v)).toBeNull();
    expect(normalizePortions(1.4999999)).toBe(1.5);
  });

  it("stepPortions con topes", () => {
    expect(stepPortions(1, 1)).toBe(1.5);
    expect(stepPortions(1, -1)).toBe(0.5);
    expect(stepPortions(0.5, -1)).toBe(0.5);
    expect(stepPortions(4, 1)).toBe(4);
    expect(stepPortions(3.5, 1)).toBe(4);
  });

  it("formatPortions", () => {
    expect(formatPortions(0.5)).toBe("½ porción");
    expect(formatPortions(1)).toBe("1 porción");
    expect(formatPortions(1.5)).toBe("1½ porciones");
    expect(formatPortions(2)).toBe("2 porciones");
    expect(formatPortions(3.5)).toBe("3½ porciones");
  });

  it("scaleMacros y recipeItemMacros", () => {
    const m: Macros = { kcal: 233.6, protein: 15.6, carbs: 35.8, fat: 1, fiber: 7.5 };
    expect(scaleMacros(m, 1.5)).toEqual({ kcal: 350.4, protein: 23.4, carbs: 53.7, fat: 1.5, fiber: 11.3 });
    expect(recipeItemMacros(m, 2)).toEqual({ kcal: 467.2, protein: 31.2, carbs: 71.6, fat: 2, fiber: 15 });
    expect(recipeItemMacros(null, 2)).toBeNull();
  });
});

describe("compareWithPublished", () => {
  const calc = (kcal: number): Macros => ({ kcal, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  const pub = (kcal: number | null) => ({ kcal, protein: null, carbs: null, fat: null, fiber: null });

  it("262 vs 305 excede con el mensaje del Gherkin", () => {
    const r = compareWithPublished(calc(305), pub(262));
    expect(r.exceeds).toBe(true);
    expect(r.message).toBe("El recetario dice 262 kcal; con los ingredientes da 305 kcal");
    expect(r.kcalDiffRatio).toBeCloseTo(43 / 262);
  });

  it("262 vs 280 (6,9 %) no excede", () => {
    const r = compareWithPublished(calc(280), pub(262));
    expect(r.exceeds).toBe(false);
    expect(r.message).toBeNull();
    expect(r.kcalDiffRatio).toBeCloseTo(0.0687, 3);
  });

  it("publicado null o 0: sin ratio ni aviso", () => {
    expect(compareWithPublished(calc(300), pub(null))).toEqual({ kcalDiffRatio: null, exceeds: false, message: null });
    expect(compareWithPublished(calc(300), pub(0))).toEqual({ kcalDiffRatio: null, exceeds: false, message: null });
    expect(compareWithPublished(calc(300), null).exceeds).toBe(false);
    expect(compareWithPublished(null, pub(262)).exceeds).toBe(false);
  });

  it("justo en el 10 % no excede", () => {
    expect(compareWithPublished(calc(110), pub(100)).exceeds).toBe(false);
    expect(compareWithPublished(calc(90), pub(100)).exceeds).toBe(false);
    expect(compareWithPublished(calc(110.1), pub(100)).exceeds).toBe(true);
  });

  it("kcal sin decimales en es-AR", () => {
    expect(compareWithPublished(calc(2100.4), pub(1500)).message).toBe(
      "El recetario dice 1.500 kcal; con los ingredientes da 2.100 kcal",
    );
  });
});

describe("validateRecipeForPublish", () => {
  const valid: RecipePublishCheck = {
    name: "Albóndigas de lentejas",
    type: "MAIN_DISH",
    moments: ["LUNCH", "DINNER"],
    yieldPortions: 8,
    portionHousehold: "¾ albóndigas",
    origin: "MANUAL",
    sourceName: null,
    ingredients: [
      { foodId: "f1", label: null, grams: 500, noQuantity: false },
      { foodId: "f2", label: "Perejil", grams: null, noQuantity: true },
      { foodId: null, label: "Pan rallado", grams: null, noQuantity: false },
    ],
  };

  it("una receta válida no tiene issues", () => {
    expect(validateRecipeForPublish(valid)).toEqual([]);
  });

  it("cada regla por separado", () => {
    expect(validateRecipeForPublish({ ...valid, name: "  " })).toEqual([{ field: "name", message: RECIPE_TEXT.errName }]);
    expect(validateRecipeForPublish({ ...valid, name: "x".repeat(121) })[0]!.field).toBe("name");
    expect(validateRecipeForPublish({ ...valid, type: null })).toEqual([{ field: "type", message: RECIPE_TEXT.errType }]);
    expect(validateRecipeForPublish({ ...valid, moments: [] })).toEqual([{ field: "moments", message: RECIPE_TEXT.errMoments }]);
    expect(validateRecipeForPublish({ ...valid, yieldPortions: null })).toEqual([{ field: "yieldPortions", message: RECIPE_TEXT.errYield }]);
    expect(validateRecipeForPublish({ ...valid, yieldPortions: 0 })[0]!.field).toBe("yieldPortions");
    expect(validateRecipeForPublish({ ...valid, yieldPortions: 1000 })[0]!.field).toBe("yieldPortions");
    expect(validateRecipeForPublish({ ...valid, portionHousehold: "" })).toEqual([{ field: "portionHousehold", message: RECIPE_TEXT.errPortion }]);
    expect(validateRecipeForPublish({ ...valid, ingredients: [] })).toEqual([{ field: "ingredients", message: RECIPE_TEXT.errIngredients }]);
    expect(
      validateRecipeForPublish({ ...valid, ingredients: [{ foodId: null, label: " ", grams: null, noQuantity: false }] }),
    ).toEqual([{ field: "ingredient", index: 0, message: RECIPE_TEXT.errIngredientEmpty }]);
    expect(
      validateRecipeForPublish({ ...valid, ingredients: [{ foodId: "f1", label: null, grams: null, noQuantity: false }] }),
    ).toEqual([{ field: "ingredient", index: 0, message: RECIPE_TEXT.errIngredientGrams }]);
    expect(
      validateRecipeForPublish({ ...valid, ingredients: [{ foodId: "f1", label: null, grams: 0, noQuantity: false }] }),
    ).toEqual([{ field: "ingredient", index: 0, message: RECIPE_TEXT.errIngredientGrams }]);
    expect(
      validateRecipeForPublish({ ...valid, ingredients: [{ foodId: null, label: "Agua", grams: 100000, noQuantity: false }] }),
    ).toEqual([{ field: "ingredient", index: 0, message: RECIPE_TEXT.errIngredientGramsRange }]);
  });

  it("respeta el orden documentado", () => {
    const issues = validateRecipeForPublish({
      name: "",
      type: null,
      moments: [],
      yieldPortions: null,
      portionHousehold: null,
      origin: "IMPORT",
      sourceName: " ",
      ingredients: [],
    });
    expect(issues.map((i) => i.field)).toEqual([
      "name",
      "type",
      "moments",
      "yieldPortions",
      "portionHousehold",
      "ingredients",
      "sourceName",
    ]);
  });

  it("IMPORT sin fuente da errSource; MANUAL sin fuente pasa", () => {
    expect(validateRecipeForPublish({ ...valid, origin: "IMPORT", sourceName: null })).toEqual([
      { field: "sourceName", message: RECIPE_TEXT.errSource },
    ]);
    expect(validateRecipeForPublish({ ...valid, origin: "IMPORT", sourceName: "Recetario X" })).toEqual([]);
    expect(validateRecipeForPublish({ ...valid, origin: "MANUAL", sourceName: null })).toEqual([]);
  });

  it("alimento con c.n. y sin gramos pasa", () => {
    expect(
      validateRecipeForPublish({ ...valid, ingredients: [{ foodId: "f1", label: null, grams: null, noQuantity: true }] }),
    ).toEqual([]);
  });
});

type Card = {
  id: string;
  name: string;
  searchText: string;
  type: RecipeTypeKey | null;
  moments: RecipeMomentKey[];
  tags: RecipeTagKey[];
};
const card = (id: string, name: string, ingredientNames: string[], type: RecipeTypeKey, moments: RecipeMomentKey[], tags: RecipeTagKey[] = []): Card => ({
  id, name, type, moments, tags, searchText: recipeSearchText({ name, ingredientNames, tags }),
});

describe("búsqueda y filtros", () => {
  const cards = [
    card("1", "Torta de limón", ["Harina", "Limón"], "DESSERT", ["AFTERNOON_SNACK"], ["VEGETARIAN"]),
    card("2", "Albóndigas de lentejas", ["Lentejas", "Puré de calabaza", "Zapallo, hervido"], "MAIN_DISH", ["LUNCH", "DINNER"], ["MEAL_PREP", "VEGETARIAN"]),
    card("3", "Budín sin harina", ["Almendras"], "DESSERT", ["BREAKFAST"], ["GLUTEN_FREE"]),
    card("4", "Arroz con pollo", ["Arroz", "Pollo"], "MAIN_DISH", ["LUNCH"]),
  ];

  it("'limon' encuentra 'Limón' sin tilde", () => {
    expect(filterRecipes(cards, { ...EMPTY_RECIPE_FILTERS, query: "limon" }).map((c) => c.id)).toEqual(["1"]);
  });

  it("encuentra por el nombre del alimento aunque el label sea otro", () => {
    expect(filterRecipes(cards, { ...EMPTY_RECIPE_FILTERS, query: "zapallo" }).map((c) => c.id)).toEqual(["2"]);
  });

  it("encuentra por la etiqueta del tag", () => {
    expect(filterRecipes(cards, { ...EMPTY_RECIPE_FILTERS, query: "tacc" }).map((c) => c.id)).toEqual(["3"]);
  });

  it("los chips combinan con AND", () => {
    expect(filterRecipes(cards, { ...EMPTY_RECIPE_FILTERS, type: "MAIN_DISH", moment: "DINNER" }).map((c) => c.id)).toEqual(["2"]);
    expect(filterRecipes(cards, { ...EMPTY_RECIPE_FILTERS, tags: ["VEGETARIAN", "MEAL_PREP"] }).map((c) => c.id)).toEqual(["2"]);
    expect(filterRecipes(cards, { ...EMPTY_RECIPE_FILTERS, type: "DESSERT", query: "harina" }).map((c) => c.id).sort()).toEqual(["1", "3"]);
    expect(filterRecipes(cards, { ...EMPTY_RECIPE_FILTERS, type: "SALAD" })).toEqual([]);
  });

  it("sin consulta el orden es alfabético", () => {
    expect(filterRecipes(cards, EMPTY_RECIPE_FILTERS).map((c) => c.name)).toEqual([
      "Albóndigas de lentejas",
      "Arroz con pollo",
      "Budín sin harina",
      "Torta de limón",
    ]);
  });

  it("hasActiveRecipeFilters", () => {
    expect(hasActiveRecipeFilters(EMPTY_RECIPE_FILTERS)).toBe(false);
    expect(hasActiveRecipeFilters({ ...EMPTY_RECIPE_FILTERS, query: " " })).toBe(false);
    expect(hasActiveRecipeFilters({ ...EMPTY_RECIPE_FILTERS, tags: ["VEGETARIAN"] })).toBe(true);
  });

  it("recipeCountText", () => {
    expect(recipeCountText(24, 186, true)).toBe("Mostrando 24 de 186 recetas");
    expect(recipeCountText(186, 186, false)).toBe("186 recetas");
    expect(recipeCountText(1, 1, false)).toBe("1 receta");
  });
});

describe("recipeUsageWarning", () => {
  it("singular y plural, omite lo que es 0", () => {
    expect(recipeUsageWarning({ plans: 3, templates: 1 })).toBe(
      "Esta receta está en 3 planes y 1 plantilla. Sus totales van a cambiar.",
    );
    expect(recipeUsageWarning({ plans: 1, templates: 0 })).toBe("Esta receta está en 1 plan. Sus totales van a cambiar.");
    expect(recipeUsageWarning({ plans: 0, templates: 2 })).toBe(
      "Esta receta está en 2 plantillas. Sus totales van a cambiar.",
    );
    expect(recipeUsageWarning({ plans: 0, templates: 0 })).toBeNull();
  });
});

describe("catálogos", () => {
  it("labels completos", () => {
    expect(Object.keys(RECIPE_TYPE_LABELS)).toHaveLength(7);
    expect(RECIPE_TAG_LABELS.MEAL_PREP).toBe("Apta vianda / freezer");
  });
});
