import { describe, expect, it } from "vitest";
import type { Macros } from "./nutrition";
import { filterRecipes, recipeSearchText, type RecipeMomentKey, type RecipeTagKey, type RecipeTypeKey } from "./recipes";
import {
  WEEKDAYS,
  compareToTarget,
  computeWeeklyTotals,
  mealTotalForDay,
  type MacroTarget,
  type Weekday,
  type WeeklyMenuMeal,
} from "./weekly-menu";
import {
  PICKER_SUGGESTED_INGREDIENTS,
  RECIPE_PICKER_TEXT,
  addAriaLabel,
  addButtonLabel,
  agreeParticipleEs,
  computeRecipeImpact,
  daysMissingRecipe,
  formatIngredientAmount,
  formatRecipeImpact,
  genderNumberEs,
  inferMomentFromMealName,
  initialPickerFilters,
  noTargetStripText,
  openPickerAriaLabel,
  pickerDaysHint,
  pickerScope,
  pickerTitle,
  prepareRecipeImpact,
  recipeAddedMessage,
  recipePortionText,
  stepperAriaLabel,
  type PickerScope,
  type RecipeImpact,
} from "./recipe-picker";

/** Los textos usan espacio duro antes de las unidades y del %; acá se comparan con espacio común. */
const sp = (s: string) => s.replace(/ /g, " ");

const TARGET: MacroTarget = { kcal: 1800, protein: 110, carbs: 200, fat: 60 };
const m = (kcal: number, protein = 0, carbs = 0, fat = 0, fiber = 0): Macros => ({ kcal, protein, carbs, fat, fiber });
let seq = 0;
const it_ = (weekday: Weekday | null, macros: Macros | null) => ({ id: `i${++seq}`, weekday, macros });
const meal = (id: string, mode: "EVERY_DAY" | "PER_DAY", items: WeeklyMenuMeal["items"], isOptions = false): WeeklyMenuMeal => ({
  id, mode, isOptions, items,
});
const ADD = m(255, 12, 30, 8, 3);

function impactFor(meals: WeeklyMenuMeal[], mealId: string, scope: PickerScope, add: Macros = ADD): RecipeImpact {
  const ctx = prepareRecipeImpact({ meals, mealId, scope, target: TARGET });
  if (!ctx) throw new Error("sin contexto");
  return computeRecipeImpact(ctx, add);
}

describe("inferMomentFromMealName (D11)", () => {
  it.each([
    ["Desayuno", "BREAKFAST"], ["desayuno ", "BREAKFAST"], ["DESAYUNO", "BREAKFAST"],
    ["Almuerzo", "LUNCH"], ["Merienda", "AFTERNOON_SNACK"], ["Cena", "DINNER"],
    ["Colación", "SNACK"], ["Colaciones", "SNACK"], ["colacion 1", "SNACK"],
    ["Media mañana", "SNACK"], ["Media tarde", "AFTERNOON_SNACK"],
    ["Almuerzo y cena", "LUNCH"], ["Cena o almuerzo", "DINNER"],
  ])("%s → %s", (name, moment) => {
    expect(inferMomentFromMealName(name)).toBe(moment);
  });
  it("palabra completa: 'Pre entreno', 'Escena' y '' no tienen momento", () => {
    expect(inferMomentFromMealName("Pre entreno")).toBeNull();
    expect(inferMomentFromMealName("Escena")).toBeNull();
    expect(inferMomentFromMealName("Cenas")).toBeNull();
    expect(inferMomentFromMealName("")).toBeNull();
  });
  it("initialPickerFilters trae el momento y nada más", () => {
    expect(initialPickerFilters("Desayuno")).toEqual({ query: "", type: null, moment: "BREAKFAST", tags: [] });
    expect(initialPickerFilters("Postre").moment).toBeNull();
  });
});

describe("pickerScope / daysMissingRecipe", () => {
  const perDay = { mode: "PER_DAY" as const };
  const everyDay = { mode: "EVERY_DAY" as const };
  it("plan no semanal → PLAN", () => {
    expect(pickerScope([everyDay, everyDay], everyDay, null, [])).toEqual({ kind: "PLAN" });
  });
  it("comida EVERY_DAY en un plan semanal → EVERY_DAY", () => {
    expect(pickerScope([perDay, everyDay], everyDay, "TUE", ["TUE"])).toEqual({ kind: "EVERY_DAY" });
  });
  it("PER_DAY: días en orden de la semana, con el día que se edita aunque no venga", () => {
    expect(pickerScope([perDay], perDay, "TUE", ["THU", "SAT"])).toEqual({
      kind: "DAYS", focusDay: "TUE", days: ["TUE", "THU", "SAT"],
    });
    expect(pickerScope([perDay], perDay, "TUE", ["SAT", "TUE", "THU"])).toEqual({
      kind: "DAYS", focusDay: "TUE", days: ["TUE", "THU", "SAT"],
    });
  });
  it("daysMissingRecipe saltea los días que ya la tienen", () => {
    const meal = { mode: "PER_DAY" as const, items: [
      { weekday: "TUE" as const, recipeId: "r1" }, { weekday: "THU" as const, recipeId: "r2" }, { weekday: "SAT" as const, recipeId: null },
    ] };
    expect(daysMissingRecipe(meal, "r1", ["SAT", "TUE", "THU"])).toEqual(["THU", "SAT"]);
    expect(daysMissingRecipe(meal, "r2", ["TUE", "THU"])).toEqual(["TUE"]);
  });
  it("EVERY_DAY: [] si la comida ya la tiene", () => {
    const meal = { mode: "EVERY_DAY" as const, items: [{ weekday: null, recipeId: "r1" }] };
    expect(daysMissingRecipe(meal, "r1", ["MON"])).toEqual([]);
    expect(daysMissingRecipe(meal, "r9", ["MON"])).toEqual(["MON"]);
  });
});

describe("impacto en un día (DAYS)", () => {
  const scope: PickerScope = { kind: "DAYS", focusDay: "TUE", days: ["TUE"] };
  it("martes 1.240 + 255 → 1.495; 14 % del martes; entra", () => {
    const meals = [meal("d", "PER_DAY", [it_("TUE", m(1240, 70, 150, 40))])];
    const impact = impactFor(meals, "d", scope);
    expect(impact.reference).toBe("DAY");
    expect(impact.day).toBe("TUE");
    expect(impact.before.kcal).toBe(1240);
    expect(impact.after.kcal).toBe(1495);
    expect(impact.percentOfTarget).toBe(14);
    expect(impact.optionsAverageKcal).toBeNull();
    expect(impact.fit).toEqual({ kind: "FITS" });
    const t = formatRecipeImpact(impact, scope);
    expect(sp(t.percentText)).toBe("Suma 14 % de las kcal del martes");
    expect(t.fitText).toBe("Entra en lo que falta");
  });
  it("borde del ±5 %: grasas 63 contra 60 entra; 64 se pasa (+4 g)", () => {
    const at = (fat: number) => impactFor([meal("d", "PER_DAY", [it_("TUE", m(1240, 70, 150, fat))])], "d", scope);
    expect(at(55).fit).toEqual({ kind: "FITS" });
    const over = at(56);
    expect(over.fit).toEqual({ kind: "OVER", macro: "fat", excess: 4, day: null });
    expect(sp(formatRecipeImpact(over, scope).fitText)).toBe("Se pasa en grasas (+4 g)");
  });
  it("kcal en es-AR y sin decimales: +1.200 kcal", () => {
    const impact = impactFor([meal("d", "PER_DAY", [it_("TUE", m(2745))])], "d", scope);
    expect(impact.fit).toEqual({ kind: "OVER", macro: "kcal", excess: 1200, day: null });
    expect(sp(formatRecipeImpact(impact, scope).fitText)).toBe("Se pasa en calorías (+1.200 kcal)");
  });
  it("menos de 1 %", () => {
    const impact = impactFor([meal("d", "PER_DAY", [it_("TUE", m(1000))])], "d", scope, m(5));
    expect(impact.percentOfTarget).toBe(0);
    expect(sp(formatRecipeImpact(impact, scope).percentText)).toBe("Suma menos de 1 % de las kcal del martes");
  });
  it("día sin cargar: el after solo tiene la receta y las comidas EVERY_DAY", () => {
    const meals = [
      meal("d", "PER_DAY", [it_("MON", m(900)), it_("TUE", m(1000))]),
      meal("c", "EVERY_DAY", [it_(null, m(100, 1, 2, 3))]),
    ];
    const impact = impactFor(meals, "d", { kind: "DAYS", focusDay: "WED", days: ["WED"] });
    expect(impact.before.kcal).toBe(100);
    expect(impact.after).toEqual(m(355, 13, 32, 11, 3));
  });
});

describe("peor día (varios días marcados)", () => {
  const meals = () => [
    meal("d", "PER_DAY", [
      it_("TUE", m(1000, 50, 100, 30)),
      it_("THU", m(1000, 50, 100, 60)), // grasas 68 → +8 g (13 %)
      it_("SAT", m(1645, 50, 100, 30)), // kcal 1.900 → +100 kcal (5,6 %)
    ]),
  ];
  it("gana el mayor exceso relativo y nombra el día", () => {
    const scope: PickerScope = { kind: "DAYS", focusDay: "TUE", days: ["TUE", "THU", "SAT"] };
    const impact = impactFor(meals(), "d", scope);
    expect(impact.fit).toEqual({ kind: "OVER", macro: "fat", excess: 8, day: "THU" });
    expect(sp(formatRecipeImpact(impact, scope).fitText)).toBe("Se pasa en grasas el jueves (+8 g)");
    // La franja sigue en el martes.
    expect(impact.before.kcal).toBe(1000);
    expect(impact.after.kcal).toBe(1255);
  });
  it("empate: gana el primero de la semana", () => {
    const tie = [meal("d", "PER_DAY", [it_("THU", m(1000, 50, 100, 60)), it_("SAT", m(1000, 50, 100, 60))])];
    const impact = impactFor(tie, "d", { kind: "DAYS", focusDay: "SAT", days: ["THU", "SAT"] });
    expect(impact.fit).toEqual({ kind: "OVER", macro: "fat", excess: 8, day: "THU" });
  });
});

describe("EVERY_DAY en un plan semanal", () => {
  const scope: PickerScope = { kind: "EVERY_DAY" };
  it("referencia: el promedio semanal, 'de cada día'", () => {
    const meals = [
      meal("d", "PER_DAY", [it_("MON", m(1000)), it_("TUE", m(1200))]),
      meal("c", "EVERY_DAY", [it_(null, m(100))]),
    ];
    const impact = impactFor(meals, "c", scope);
    expect(impact.reference).toBe("WEEK_AVERAGE");
    expect(impact.day).toBeNull();
    expect(impact.before.kcal).toBe(1200);
    expect(impact.after.kcal).toBe(1455);
    expect(sp(formatRecipeImpact(impact, scope).percentText)).toBe("Suma 14 % de las kcal de cada día");
  });
  it("OVER dice 'en el promedio'", () => {
    const meals = [meal("d", "PER_DAY", [it_("MON", m(1500, 80, 150, 70))]), meal("c", "EVERY_DAY", [])];
    const impact = impactFor(meals, "c", scope);
    expect(impact.fit).toEqual({ kind: "OVER", macro: "fat", excess: 18, day: null });
    expect(sp(formatRecipeImpact(impact, scope).fitText)).toBe("Se pasa en grasas en el promedio (+18 g)");
  });
  it("sin días PER_DAY cargados, la referencia es el lunes", () => {
    const meals = [meal("d", "PER_DAY", []), meal("c", "EVERY_DAY", [it_(null, m(100))])];
    const impact = impactFor(meals, "c", scope);
    expect(impact.before.kcal).toBe(100);
    expect(impact.after.kcal).toBe(355);
  });
});

describe("opciones (N1)", () => {
  const scope: PickerScope = { kind: "EVERY_DAY" };
  const meals = () => [
    meal("d", "PER_DAY", [it_("MON", m(1000))]),
    meal("c", "EVERY_DAY", [it_(null, m(180)), it_(null, m(80)), it_(null, m(70))], true),
  ];
  it("el promedio pasa de 110 a 146,3 y el día suma +36,3, no +255", () => {
    const impact = impactFor(meals(), "c", scope);
    expect(impact.optionsAverageKcal).toBe(146.3);
    expect(impact.before.kcal).toBe(1110);
    expect(impact.after.kcal).toBe(1146.3);
    expect(sp(formatRecipeImpact(impact, scope).percentText)).toBe("Como opción, la comida pasa a promediar 146 kcal");
  });
  it("una opción más liviana da un porcentaje negativo y el texto de opciones", () => {
    const impact = impactFor(meals(), "c", scope, m(50));
    expect(impact.percentOfTarget).toBeLessThan(0);
    const text = formatRecipeImpact(impact, scope).percentText;
    expect(text).not.toContain("Suma");
    expect(sp(text)).toBe("Como opción, la comida pasa a promediar 95 kcal");
  });
});

describe("plan no semanal (PLAN) y sin objetivo", () => {
  it("referencia: el lunes, 'del día'", () => {
    const scope: PickerScope = { kind: "PLAN" };
    const impact = impactFor([meal("a", "EVERY_DAY", [it_(null, m(800))])], "a", scope);
    expect(impact.reference).toBe("PLAN_DAY");
    expect(impact.after.kcal).toBe(1055);
    expect(sp(formatRecipeImpact(impact, scope).percentText)).toBe("Suma 14 % de las kcal del día");
  });
  it("sin objetivo o sin la comida → null", () => {
    const meals = [meal("a", "EVERY_DAY", [])];
    expect(prepareRecipeImpact({ meals, mealId: "a", scope: { kind: "PLAN" }, target: null })).toBeNull();
    expect(prepareRecipeImpact({ meals, mealId: "x", scope: { kind: "PLAN" }, target: TARGET })).toBeNull();
  });
});

// Referencia escrita aparte, tal como la define la SDD (4.1), para comparar con la implementación.
function referenceImpact(meals: WeeklyMenuMeal[], mealId: string, scope: PickerScope, add: Macros): RecipeImpact {
  const target = TARGET;
  const base = computeWeeklyTotals(meals);
  const days = scope.kind === "DAYS" ? scope.days : [null];
  const withItem = meals.map((x) =>
    x.id === mealId ? { ...x, items: [...x.items, ...days.map((weekday) => ({ id: "__preview", weekday, macros: add }))] } : x,
  );
  const after = computeWeeklyTotals(withItem);
  const pick = (t: typeof base) =>
    scope.kind === "DAYS" ? t.days[scope.focusDay].macros : scope.kind === "EVERY_DAY" ? (t.weeklyAverage ?? t.days.MON.macros) : t.days.MON.macros;
  const keys = ["kcal", "protein", "carbs", "fat"] as const;
  const worst = (d: Macros) => {
    let w: { macro: (typeof keys)[number]; excess: number; rel: number } | null = null;
    for (const k of keys) {
      const s = compareToTarget(d[k], target[k]);
      if (s?.kind === "OVER" && (!w || s.excess / target[k] > w.rel)) w = { macro: k, excess: s.excess, rel: s.excess / target[k] };
    }
    return w;
  };
  let fit: RecipeImpact["fit"] = { kind: "FITS" };
  if (scope.kind === "DAYS") {
    let best: { macro: (typeof keys)[number]; excess: number; rel: number; day: Weekday } | null = null;
    for (const d of WEEKDAYS.filter((x) => scope.days.includes(x))) {
      const w = worst(after.days[d].macros);
      if (w && (!best || w.rel > best.rel)) best = { ...w, day: d };
    }
    if (best) fit = { kind: "OVER", macro: best.macro, excess: best.excess, day: scope.days.length > 1 ? best.day : null };
  } else {
    const w = worst(pick(after));
    if (w) fit = { kind: "OVER", macro: w.macro, excess: w.excess, day: null };
  }
  const target_ = withItem.find((x) => x.id === mealId)!;
  return {
    reference: scope.kind === "DAYS" ? "DAY" : scope.kind === "EVERY_DAY" ? "WEEK_AVERAGE" : "PLAN_DAY",
    day: scope.kind === "DAYS" ? scope.focusDay : null,
    before: pick(base),
    after: pick(after),
    percentOfTarget: Math.round(((pick(after).kcal - pick(base).kcal) / target.kcal) * 100),
    optionsAverageKcal: target_.isOptions ? mealTotalForDay(target_, scope.kind === "DAYS" ? scope.focusDay : "MON").macros.kcal : null,
    fit,
  };
}

describe("equivalencia con la semántica de referencia", () => {
  // Generador determinístico (LCG) para no depender de Math.random.
  let state = 18003;
  const rnd = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const macros = () => m(int(50, 900), int(2, 60), int(5, 120), int(1, 45), int(0, 10));

  it("30 combinaciones dan lo mismo", () => {
    for (let n = 0; n < 30; n++) {
      const weekly = rnd() < 0.7;
      const meals: WeeklyMenuMeal[] = [];
      const mealCount = int(1, 4);
      for (let k = 0; k < mealCount; k++) {
        const perDay = weekly && (k === 0 || rnd() < 0.5);
        const isOptions = !perDay && rnd() < 0.4;
        const items = Array.from({ length: int(0, 6) }, () =>
          it_(perDay ? WEEKDAYS[int(0, 6)]! : null, rnd() < 0.15 ? null : macros()),
        );
        meals.push(meal(`m${k}`, perDay ? "PER_DAY" : "EVERY_DAY", items, isOptions));
      }
      const chosen = meals[int(0, meals.length - 1)]!;
      const marked = WEEKDAYS.filter(() => rnd() < 0.3);
      const scope = pickerScope(meals, chosen, WEEKDAYS[int(0, 6)]!, marked);
      const add = macros();
      expect(impactFor(meals, chosen.id, scope, add)).toEqual(referenceImpact(meals, chosen.id, scope, add));
    }
  });
});

describe("textos de porción e ingrediente", () => {
  it("recipePortionText", () => {
    expect(recipePortionText(1, "2 panqueques")).toBe("1 porción (2 panqueques)");
    expect(recipePortionText(1.5, "2 panqueques")).toBe("1½ porciones (1 porción = 2 panqueques)");
    expect(recipePortionText(0.5, null)).toBe("½ porción");
    expect(recipePortionText(2, "   ")).toBe("2 porciones");
  });
  it("formatIngredientAmount", () => {
    expect(formatIngredientAmount({ household: "1 pizca", grams: null, noQuantity: true })).toBe("c.n.");
    expect(sp(formatIngredientAmount({ household: "1 taza", grams: 300, noQuantity: false }))).toBe("1 taza (300 g)");
    expect(formatIngredientAmount({ household: "1 taza", grams: null, noQuantity: false })).toBe("1 taza");
    expect(sp(formatIngredientAmount({ household: null, grams: 62.5, noQuantity: false }))).toBe("62,5 g");
    expect(formatIngredientAmount({ household: " ", grams: null, noQuantity: false })).toBe("");
  });
});

describe("concordancia", () => {
  it.each([
    ["Panqueques de avena", "agregados"], ["Budín de banana", "agregado"], ["Tarta de jamón", "agregada"],
    ["Galletitas", "agregadas"], ["Crumble", "agregado"], ["Albóndigas de lentejas", "agregadas"],
    ["Infusión", "agregada"], ["Leche con cacao", "agregada"], ["Pan de avena", "agregado"],
  ])("%s → %s", (name, expected) => {
    expect(agreeParticipleEs(name, "agregado")).toBe(expected);
  });
  it("genderNumberEs mira la primera palabra", () => {
    expect(genderNumberEs("Carne al horno con papas")).toEqual({ feminine: true, plural: false });
    expect(genderNumberEs("Muffins de banana")).toEqual({ feminine: false, plural: true });
  });
});

describe("textos del buscador", () => {
  const days: PickerScope = { kind: "DAYS", focusDay: "TUE", days: ["TUE", "THU", "SAT"] };
  it("recipeAddedMessage", () => {
    expect(recipeAddedMessage("Panqueques de avena y banana", "Desayuno", days, ["TUE", "THU", "SAT"])).toBe(
      "Panqueques de avena y banana agregados a Desayuno (martes, jueves y sábado)",
    );
    expect(recipeAddedMessage("Budín de banana", "Desayuno", days, ["THU"])).toBe("Budín de banana agregado a Desayuno (jueves)");
    expect(recipeAddedMessage("Galletitas de avena", "Colaciones", { kind: "EVERY_DAY" }, [])).toBe(
      "Galletitas de avena agregadas a Colaciones (todos los días)",
    );
    expect(recipeAddedMessage("Tarta de jamón", "Almuerzo", { kind: "PLAN" }, [])).toBe("Tarta de jamón agregada a Almuerzo");
  });
  it("pickerTitle en los 3 alcances", () => {
    expect(pickerTitle("Desayuno", days)).toBe("Agregar a Desayuno · Martes");
    expect(pickerTitle("Colaciones", { kind: "EVERY_DAY" })).toBe("Agregar a Colaciones · Todos los días");
    expect(pickerTitle("Almuerzo", { kind: "PLAN" })).toBe("Agregar a Almuerzo");
  });
  it("addButtonLabel, aria y ayudas", () => {
    expect(addButtonLabel(1)).toBe("Agregar");
    expect(addButtonLabel(3)).toBe("Agregar en 3 días");
    expect(addAriaLabel("Budín", "Desayuno", days)).toBe("Agregar Budín a desayuno del martes");
    expect(addAriaLabel("Budín", "Colaciones", { kind: "EVERY_DAY" })).toBe("Agregar Budín a colaciones");
    expect(openPickerAriaLabel("Desayuno", days)).toBe("Agregar receta a Desayuno del martes");
    expect(pickerDaysHint("TUE")).toBe("El martes queda marcado: es el día que estás editando.");
    expect(stepperAriaLabel(-1, "Budín")).toBe("Restar media porción de Budín");
    expect(stepperAriaLabel(1, "Budín")).toBe("Sumar media porción de Budín");
    expect(sp(noTargetStripText("Martes", m(1240, 70, 150, 40)))).toBe("Martes: 1.240 kcal · P 70 g · C 150 g · G 40 g");
    expect(PICKER_SUGGESTED_INGREDIENTS).toEqual(["avena", "huevo", "banana", "pollo"]);
    expect(RECIPE_PICKER_TEXT.searchPlaceholder).toBe("Buscar por ingrediente o nombre: avena, pollo…");
  });
});

describe("búsqueda del buscador (D13 y la HU)", () => {
  const card = (name: string, ingredients: string[], moments: RecipeMomentKey[], type: RecipeTypeKey, tags: RecipeTagKey[] = []) => ({
    name, type, moments, tags, searchText: recipeSearchText({ name, ingredientNames: ingredients, tags }),
  });
  const cards = [
    card("Panqueques de avena y banana", ["Avena, arrollada", "Banana"], ["BREAKFAST", "AFTERNOON_SNACK"], "BREAKFAST"),
    card("Budín de limón", ["Harina", "Limón, jugo"], ["BREAKFAST"], "DESSERT"),
    card("Galletitas", ["Avena, arrollada", "Manteca"], ["SNACK"], "SNACK"),
    card("Avena overnight", ["Avena, arrollada", "Yogur"], ["BREAKFAST"], "BREAKFAST"),
    card("Albóndigas de lentejas", ["Lentejas"], ["LUNCH", "DINNER"], "MAIN_DISH", ["MEAL_PREP"]),
  ];
  const filters = initialPickerFilters("Desayuno");
  it("'avena' con el momento Desayuno trae nombre o ingrediente, por relevancia", () => {
    expect(filterRecipes(cards, { ...filters, query: "avena" }).map((c) => c.name)).toEqual([
      "Avena overnight", "Panqueques de avena y banana",
    ]);
  });
  it("'limon' encuentra 'limón' y 'vianda' encuentra la etiqueta", () => {
    expect(filterRecipes(cards, { ...filters, query: "limon" }).map((c) => c.name)).toEqual(["Budín de limón"]);
    expect(filterRecipes(cards, { ...filters, moment: null, query: "vianda" }).map((c) => c.name)).toEqual(["Albóndigas de lentejas"]);
  });
  it("una receta con avena sin el momento aparece recién con 'Todos'", () => {
    expect(filterRecipes(cards, { ...filters, query: "avena" }).some((c) => c.name === "Galletitas")).toBe(false);
    expect(filterRecipes(cards, { ...filters, moment: null, query: "avena" }).some((c) => c.name === "Galletitas")).toBe(true);
  });
});
