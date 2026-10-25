import { describe, expect, it } from "vitest";
import {
  COVER_NAME_LINE,
  UNKNOWN_LINES,
  UNKNOWN_PAGE_NUMBER,
  longComboPlan,
  noMenuPlan,
  scannedPlan,
  singleTandaPlan,
  syntheticPlan,
} from "./__fixtures__/synthetic-plan";
import { PLAN_IMPORT_LABEL_MAX, parsePlanPdf, planImportKey } from "./parse";
import type { PlanImportDraft, PlanImportMeal } from "./types";

const recipes = [
  { id: "r1", name: "Budín de prueba" },
  { id: "r2", name: "Tarta dulce" },
  { id: "r3", name: "Galletas de avena" },
];
const KEY = planImportKey("a".repeat(64));

function parse(pages = syntheticPlan, r = recipes): PlanImportDraft {
  const res = parsePlanPdf(pages, { importKey: KEY, recipes: r });
  if (!res.ok) throw new Error(res.reason);
  return res.draft;
}

const meal = (d: PlanImportDraft, name: string): PlanImportMeal => {
  const m = d.meals.find((x) => x.name === name);
  if (!m) throw new Error(`sin comida ${name}`);
  return m;
};
const textOf = (m: PlanImportMeal, day: string) =>
  m.items.filter((i) => i.weekday === day).map((i) => (i.kind === "TEXT" ? { label: i.label, notes: i.notes } : i));

describe("planImportKey", () => {
  it("formatea y valida el hash", () => {
    expect(KEY).toBe(`pdf-sha256:${"a".repeat(64)}`);
    expect(() => planImportKey("xyz")).toThrow();
  });
});

describe("parsePlanPdf — no se puede leer", () => {
  it("escaneado → NO_TEXT; sin menú → NO_MENU", () => {
    expect(parsePlanPdf(scannedPlan, { importKey: KEY, recipes })).toEqual({ ok: false, reason: "NO_TEXT" });
    expect(parsePlanPdf(noMenuPlan, { importKey: KEY, recipes })).toEqual({ ok: false, reason: "NO_MENU" });
  });
});

describe("parsePlanPdf — plan sintético", () => {
  const d = parse();

  it("título = objetivo de la portada", () => {
    expect(d.title).toBe("Para comer más verduras y moverse más");
    expect(d.importKey).toBe(KEY);
  });

  it("comidas en orden D6/D7, nunca 'Desayuno y merienda'", () => {
    expect(d.meals.map((m) => m.name)).toEqual([
      "Desayuno (1)",
      "Merienda (1)",
      "Desayuno (2)",
      "Merienda (2)",
      "Almuerzo",
      "Cena",
      "Colaciones",
    ]);
    expect(d.meals.map((m) => m.key)).toEqual(["BREAKFAST:1", "SNACK:1", "BREAKFAST:2", "SNACK:2", "LUNCH:1", "DINNER:1", "OPTIONS"]);
    expect(d.meals.filter((m) => m.key !== "OPTIONS").every((m) => m.mode === "PER_DAY" && !m.isOptions)).toBe(true);
  });

  it("desayuno y merienda: la misma combinación normalizada y la misma nota", () => {
    const expected = [
      { label: "Café con leche + pan de centeno + ricota + kiwi", notes: "Hidratos de carbono (fibra), proteínas y grasas saludables" },
    ];
    expect(textOf(meal(d, "Desayuno (1)"), "MON")).toEqual(expected);
    expect(textOf(meal(d, "Merienda (1)"), "MON")).toEqual(expected);
    // Combinación partida en 2 renglones → un solo ítem.
    expect(textOf(meal(d, "Desayuno (1)"), "SAT")).toEqual([
      { label: "Té + pan integral + palta + tomate cherry", notes: "Hidratos de carbono (fibra), proteínas y grasas saludables" },
    ]);
  });

  it("almuerzo y cena: etiquetas, 'Almuerzo y Cena:' en las dos, 'Cena:' sin espacio, renglón partido", () => {
    const lunch = meal(d, "Almuerzo");
    const dinner = meal(d, "Cena");
    expect(textOf(lunch, "TUE")).toEqual(textOf(dinner, "TUE"));
    expect(textOf(lunch, "TUE")[0]).toMatchObject({ label: "Wok de tofu + vegetales salteados" });
    expect(textOf(lunch, "WED")).toEqual([
      { label: "Cerdo magro + batata + ensalada ( pepino + rúcula)", notes: "Hidratos de carbono Proteínas y grasas saludables" },
    ]);
    expect(textOf(dinner, "WED")[0]).toMatchObject({ label: "Pollo al limón + ensalada ( pepino + rúcula)" });
    expect(textOf(lunch, "THU")[0]).toMatchObject({ label: "Lentejas guisadas + arroz" });
    expect(lunch.items).toHaveLength(7);
    expect(dinner.items).toHaveLength(7);
  });

  it("avisos de tandas, mismo contenido, días faltantes, receta sugerida, nombre, sección desconocida", () => {
    const kinds = d.hints.map((h) => h.kind);
    expect(d.hints).toContainEqual(expect.objectContaining({ kind: "TANDAS", section: "BREAKFAST_SNACK", count: 2 }));
    expect(kinds.filter((k) => k === "TANDAS")).toHaveLength(1);
    expect(kinds.filter((k) => k === "BREAKFAST_SNACK_SAME_CONTENT")).toHaveLength(1);
    expect(d.hints).toContainEqual(expect.objectContaining({ kind: "MISSING_DAYS", mealName: "Desayuno (2)", days: ["TUE"] }));
    expect(d.hints).toContainEqual(expect.objectContaining({ kind: "MISSING_DAYS", mealName: "Merienda (2)", days: ["TUE"] }));
    expect(kinds.filter((k) => k === "MISSING_DAYS")).toHaveLength(2);
    expect(d.hints).toContainEqual(expect.objectContaining({ kind: "PATIENT_NAME_REPLACED", count: 1 }));
    expect(d.hints).toContainEqual(
      expect.objectContaining({ kind: "UNKNOWN_SECTION", heading: "LISTA DE COMPRAS", page: UNKNOWN_PAGE_NUMBER }),
    );
    const unplaced = d.hints.filter((h) => h.kind === "UNPLACED");
    expect(unplaced).toEqual(UNKNOWN_LINES.map((text) => expect.objectContaining({ text, page: UNKNOWN_PAGE_NUMBER })));

    const suggestion = d.hints.find((h) => h.kind === "RECIPE_SUGGESTION");
    expect(suggestion).toMatchObject({ label: "Tarta dulce (2 unidades)", recipeId: "r2", recipeName: "Tarta dulce" });
    const ref = suggestion && suggestion.kind === "RECIPE_SUGGESTION" ? suggestion.itemRef : "";
    expect(meal(d, "Colaciones").items.some((i) => i.ref === ref && i.kind === "TEXT")).toBe(true);

    const ids = d.hints.map((h) => h.id);
    expect(ids).toEqual(ids.map((_, i) => `h${i + 1}`));
  });

  it("colaciones: opciones todos los días, recetas por nombre exacto en porciones, sin rótulos", () => {
    const snacks = meal(d, "Colaciones");
    expect(snacks).toMatchObject({ mode: "EVERY_DAY", isOptions: true });
    expect(snacks.items.map((i) => (i.kind === "RECIPE" ? `R:${i.recipeId}:${i.portions}` : i.label))).toEqual([
      "Frutas",
      "R:r1:1",
      "Tarta dulce (2 unidades)",
      "R:r3:0.5",
      "Panqueques (2 unidades) con fruta",
    ]);
    expect(snacks.items.every((i) => i.weekday === null)).toBe(true);
  });

  it("secciones de texto en orden, con subtítulos y columnas", () => {
    expect(d.sections.map((s) => s.title)).toEqual([
      "Recomendaciones",
      "Alimentos de consumo diario",
      "Alimentos de consumo ocasional",
      "Cómo armar el plato",
      "Reemplazos",
    ]);
    const body = (t: string) => d.sections.find((s) => s.title === t)!.body;
    expect(body("Recomendaciones").split("\n\n")).toHaveLength(3);
    expect(body("Recomendaciones")).toContain("[paciente] puede sumar una fruta");
    const daily = body("Alimentos de consumo diario");
    // Columna izquierda entera antes que la derecha.
    expect(daily.indexOf("LÁCTEOS")).toBeLessThan(daily.indexOf("Queso fresco"));
    expect(daily.indexOf("Queso fresco")).toBeLessThan(daily.indexOf("FRUTAS"));
    expect(daily.startsWith("LÁCTEOS\nLeche o yogur descremado en el desayuno o en la merienda.")).toBe(true);
    const plate = body("Cómo armar el plato");
    expect(plate.startsWith("Desayuno y merienda\n")).toBe(true);
    expect(plate).toContain("\n\nAlmuerzo y cena\n");
    const rep = body("Reemplazos");
    expect(rep).toContain("REEMPLAZO (Alimentos ricos en proteínas)\n");
    expect(rep).toContain("REEMPLAZO (Alimentos ricos en grasas buenas)\n");
  });

  it("garantías: sin datos de la portada ni pie, sin gramos ni alimentos", () => {
    const json = JSON.stringify(d);
    for (const s of ["Marta", "Ejemplar", "03/04/25", "Lic.", "M.P", COVER_NAME_LINE]) expect(json).not.toContain(s);
    for (const item of d.meals.flatMap((m) => m.items)) {
      const keys = Object.keys(item);
      expect(keys).not.toContain("foodId");
      expect(keys).not.toContain("quantityGrams");
      expect(keys.some((k) => k.startsWith("measure"))).toBe(false);
    }
    expect(d.stats).toMatchObject({
      pages: syntheticPlan.length,
      meals: 7,
      recipeItems: 2,
      recipeSuggestions: 1,
      sections: 5,
      unplaced: 2,
      redactions: 1,
      coverLinesDropped: 0,
    });
    expect(d.stats.footerSegments).toBeGreaterThanOrEqual(syntheticPlan.length);
  });
});

describe("parsePlanPdf — variantes", () => {
  it("una sola tanda → comidas sin número y sin aviso de tandas", () => {
    const d = parse(singleTandaPlan);
    expect(d.meals.map((m) => m.name)).toEqual(["Desayuno", "Merienda", "Almuerzo", "Cena", "Colaciones"]);
    expect(d.hints.some((h) => h.kind === "TANDAS")).toBe(false);
  });

  it(`combinación de más de ${PLAN_IMPORT_LABEL_MAX} caracteres → texto sin ubicar, no ítem`, () => {
    const d = parse(longComboPlan);
    const long = d.hints.filter((h) => h.kind === "UNPLACED" && h.text.length > PLAN_IMPORT_LABEL_MAX);
    expect(long).toHaveLength(1);
    expect(meal(d, "Desayuno (1)").items.some((i) => i.weekday === "TUE")).toBe(false);
    expect(meal(d, "Merienda (1)").items.some((i) => i.weekday === "TUE")).toBe(false);
  });

  it("sin recetas (en seco) → las opciones quedan como texto sin sugerencia", () => {
    const d = parse(syntheticPlan, []);
    const snacks = meal(d, "Colaciones");
    expect(snacks.items.every((i) => i.kind === "TEXT")).toBe(true);
    expect(snacks.items.map((i) => (i.kind === "TEXT" ? i.label : ""))).toContain("Budín de prueba (1 porción)");
    expect(d.hints.some((h) => h.kind === "RECIPE_SUGGESTION")).toBe(false);
  });
});
