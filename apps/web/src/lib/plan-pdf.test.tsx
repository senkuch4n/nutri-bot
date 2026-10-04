// HU-018b: PDF mínimo del plan por día (provisional hasta la HU-015). Recorre el árbol de
// PlanDocument (sin renderizar el PDF ni tocar la base) y mira los textos en orden.
import { describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactNode } from "react";
import type { MealItemView, MealView } from "@/components/meals-editor";

vi.mock("server-only", () => ({}));

import { PlanDocument, renderPlanPdf, type PlanPdfInput } from "./plan-pdf";

/** Textos del árbol en orden, expandiendo los componentes función (los primitivos de react-pdf son strings). */
function texts(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (!isValidElement(node)) return [];
  const props = node.props as { children?: ReactNode };
  if (typeof node.type === "function") {
    return texts((node.type as (p: unknown) => ReactNode)(props));
  }
  const children = texts(props.children);
  // Un <Text> con varios hijos ("Generado el ", fecha) se lee como una sola línea.
  return node.type === "TEXT" ? [children.join("")] : children;
}

const macros = (kcal: number) => ({ kcal, protein: 10, carbs: 20, fat: 5, fiber: 1 });
let seq = 0;
const item = (name: string, weekday: MealItemView["weekday"], kcal: number | null = 100): MealItemView => ({
  id: `i${++seq}`, foodId: null, foodName: name, customLabel: null, quantityGrams: "100", notes: null,
  macros: kcal === null ? null : macros(kcal), kcalBreakdown: null, weekday,
});
const meal = (name: string, mode: MealView["mode"], items: MealItemView[], isOptions = false): MealView => ({
  id: `m${++seq}`, name, mode, isOptions, items,
});
const input = (meals: MealView[]): PlanPdfInput => ({
  planTitle: "Plan", planNotes: null, patientName: "Paciente (TEST)", professionalName: "Lic. Prueba",
  logo: null, meals, generatedAtLabel: "3 oct 2026",
});
const render = (meals: MealView[]) => texts(PlanDocument({ input: input(meals) }));

describe("PlanDocument (HU-018b)", () => {
  it("plan no semanal: mismas secciones que antes y 'Total del plan'", () => {
    const out = render([
      meal("Desayuno", "EVERY_DAY", [item("Avena", null, 150), item("Leche", null, 120)]),
      meal("Almuerzo", "EVERY_DAY", [item("Arroz", null, 300)]),
    ]);
    expect(out.indexOf("Desayuno")).toBeLessThan(out.indexOf("Avena"));
    expect(out.indexOf("Avena")).toBeLessThan(out.indexOf("Almuerzo"));
    expect(out).toContain("Total del plan");
    expect(out.some((t) => t.startsWith("570"))).toBe(true);
    expect(out).not.toContain("Elegí una:");
    expect(out).not.toContain("Promedio diario");
    expect(out.some((t) => t.includes("Todos los días"))).toBe(false);
  });

  it("plan semanal: primero las de todos los días, después cada comida por día, y 'Promedio diario'", () => {
    const out = render([
      meal("Desayuno", "PER_DAY", [item("Avena", "MON"), item("Tostadas", "TUE"), item("Yogur", "TUE")]),
      meal("Colaciones", "EVERY_DAY", [item("Manzana", null, 80), item("Fruta", null, null)], true),
      meal("Cena", "PER_DAY", []),
    ]);
    const at = (t: string) => out.indexOf(t);
    expect(at("Colaciones · Todos los días")).toBeGreaterThan(-1);
    expect(at("Colaciones · Todos los días")).toBeLessThan(at("Desayuno"));
    expect(at("Elegí una:")).toBeGreaterThan(at("Colaciones · Todos los días"));
    expect(at("Elegí una:")).toBeLessThan(at("Manzana"));
    expect(at("Desayuno")).toBeLessThan(at("Lunes"));
    expect(at("Lunes")).toBeLessThan(at("Avena"));
    expect(at("Avena")).toBeLessThan(at("Martes"));
    expect(at("Martes")).toBeLessThan(at("Yogur"));
    // Días sin ítems y comidas sin ítems se omiten.
    expect(out).not.toContain("Miércoles");
    expect(out).not.toContain("Cena");
    expect(out).toContain("Promedio diario");
    expect(out).not.toContain("Total del plan");
    // Lunes 100 + 80 (opciones: promedio de las que tienen macros) y martes 200 + 80 → promedio 230.
    expect(out.some((t) => t.startsWith("230"))).toBe(true);
  });

  it("plan semanal sin días cargados omite el recuadro de totales", () => {
    const out = render([meal("Desayuno", "PER_DAY", [])]);
    expect(out).not.toContain("Promedio diario");
    expect(out).not.toContain("Total del plan");
  });

  it("un plan semanal de 7 días se renderiza a un PDF válido", async () => {
    const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
    const meals = ["Desayuno", "Almuerzo", "Merienda", "Cena"].map((name) =>
      meal(name, "PER_DAY", days.flatMap((d) => [item(`${name} ${d} 1`, d), item(`${name} ${d} 2`, d)])));
    meals.push(meal("Colaciones", "EVERY_DAY", [item("Manzana", null), item("Yogur", null)], true));
    const buffer = await renderPlanPdf(input(meals));
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);

  it("HU-018c: la receta sale como una línea con nombre, porción y fuente", () => {
    const recipeItem = (name: string, sourceName: string | null, portions = 1): MealItemView => ({
      id: `i${++seq}`, foodId: null, foodName: null, customLabel: null, quantityGrams: null, notes: null,
      macros: macros(255), kcalBreakdown: null, weekday: "TUE",
      recipe: { id: `r${seq}`, name, status: "PUBLISHED", type: "BREAKFAST", portions, portionHousehold: "2 panqueques", photoId: null, sourceName, macrosIncomplete: false },
    });
    const out = render([
      meal("Desayuno", "PER_DAY", [recipeItem("Panqueques de avena", "Nutriarte"), recipeItem("Budín propio", null, 1.5)]),
    ]);
    expect(out).toContain("Panqueques de avena");
    expect(out).toContain("1 porción (2 panqueques) · Fuente: Nutriarte");
    expect(out).toContain("Budín propio");
    expect(out).toContain("1½ porciones (1 porción = 2 panqueques)");
    expect(out.filter((t) => t.includes("Fuente"))).toHaveLength(1);
    expect(out).not.toContain("—");
  });

  it("HU-018d: el ítem en medida casera sale como «1½ tazas (270 g)» y el de gramos como siempre", () => {
    const measureItem: MealItemView = {
      ...item("Arroz blanco, hervido", "TUE", 351), quantityGrams: "270",
      measure: { qty: 1.5, name: "taza", plural: "tazas", gramsPerUnit: 180 },
    };
    const out = render([meal("Almuerzo", "PER_DAY", [measureItem, { ...item("Banana", "TUE", 110), quantityGrams: "120" }])]);
    expect(out).toContain("Arroz blanco, hervido");
    expect(out).toContain("1½ tazas (270 g)");
    expect(out).toContain("120 g");
    expect(out).not.toContain("270 g");
  });
});
