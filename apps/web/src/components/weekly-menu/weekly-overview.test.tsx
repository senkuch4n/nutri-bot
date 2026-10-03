// HU-018b (SDD 10.5): vista Semana y textos del editor (HTML estático, sin DOM ni base).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MealItemView, MealView } from "@/components/meals-editor";
import { WeeklyOverview } from "./weekly-overview";
import { copiedDayMessage, deleteOtherDaysWarning, replaceDaysWarning } from "./labels";
import { initialDayFor, parseDayParam, toDayParam } from "./day-param";

let seq = 0;
const item = (name: string, weekday: MealItemView["weekday"], kcal: number): MealItemView => ({
  id: `i${++seq}`, foodId: null, foodName: name, customLabel: null, quantityGrams: "100", notes: null,
  macros: { kcal, protein: 10, carbs: 20, fat: 5, fiber: 1 }, kcalBreakdown: null, weekday,
});
const meal = (name: string, mode: MealView["mode"], items: MealItemView[], isOptions = false): MealView => ({
  id: `m${++seq}`, name, mode, isOptions, items,
});

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ");

const meals = [
  meal("Desayuno", "PER_DAY", [item("Té", "MON", 10), item("Tostada", "MON", 150), item("Mate", "TUE", 5)]),
  meal("Colaciones", "EVERY_DAY", [item("Budín", null, 180), item("Fruta", null, 80), item("Huevo", null, 70)], true),
];

describe("WeeklyOverview", () => {
  const html = renderToStaticMarkup(
    <WeeklyOverview meals={meals} target={{ kcal: 1800, protein: 110, carbs: 200, fat: 60 }} onSelect={() => {}} />,
  );

  it("la comida 'Todos los días' ocupa una sola celda de 7 columnas, con 'Elegí una:'", () => {
    expect(html).toContain('colSpan="7"');
    expect(text(html)).toContain("Todos los días");
    expect(text(html)).toContain("Elegí una: Budín · Fruta · Huevo");
  });

  it("muestra los ítems por día y marca 'Sin cargar' en los días vacíos", () => {
    expect(text(html)).toContain("Té · Tostada");
    expect(text(html)).toContain("Sin cargar");
    // Lunes: 160 + promedio de opciones 110 = 270 kcal, con su estado contra el objetivo.
    expect(text(html)).toContain("270 kcal");
    expect(text(html)).toContain("Faltan 1.530 kcal");
  });

  it("termina con el promedio diario de la semana contra el objetivo", () => {
    expect(text(html)).toContain("Promedio diario de la semana");
    // Promedio de lunes (270) y martes (115) = 192,5 → 193 kcal.
    expect(text(html)).toContain("193 kcal");
    expect(text(html)).toContain("de 1.800 kcal · Faltan 1.608 kcal");
  });
});

describe("textos del editor semanal", () => {
  it("copiedDayMessage", () => {
    expect(copiedDayMessage("MON", ["TUE", "WED"])).toBe("Lunes copiado a martes y miércoles");
    expect(copiedDayMessage("MON", ["THU"])).toBe("Lunes copiado al jueves");
  });

  it("replaceDaysWarning", () => {
    expect(replaceDaysWarning(["WED", "TUE"])).toBe("Martes y miércoles ya tienen comidas. Se van a reemplazar.");
    expect(replaceDaysWarning(["FRI"], "desayuno")).toBe("Viernes ya tiene desayuno. Se van a reemplazar.");
    expect(replaceDaysWarning([])).toBeNull();
  });

  it("deleteOtherDaysWarning usa el plural del nombre o el texto genérico", () => {
    expect(deleteOtherDaysWarning("Desayuno")).toBe("Se van a borrar los desayunos de los otros días.");
    expect(deleteOtherDaysWarning("Colaciones")).toBe("Se van a borrar las colaciones de los otros días.");
    expect(deleteOtherDaysWarning("Merienda")).toBe("Se van a borrar las meriendas de los otros días.");
    expect(deleteOtherDaysWarning("Almuerzo")).toBe("Se van a borrar los almuerzos de los otros días.");
    expect(deleteOtherDaysWarning("Pre entreno")).toBe("Se van a borrar los ítems de los otros días.");
  });

  it("?dia= ida y vuelta, y el día inicial", () => {
    expect(parseDayParam("mie")).toBe("WED");
    expect(parseDayParam("semana")).toBe("WEEK");
    expect(parseDayParam("xx")).toBeNull();
    expect(parseDayParam(["lun"])).toBeNull();
    expect(toDayParam("SAT")).toBe("sab");
    expect(initialDayFor("vie", [])).toBe("FRI");
    expect(initialDayFor(undefined, [{ items: [] }])).toBe("WEEK");
    expect(initialDayFor(undefined, [{ items: [1] }])).toBe("MON");
  });
});

describe("concordancia con el nombre de la comida", () => {
  it("withArticle y agreeWithMeal", async () => {
    const { withArticle, agreeWithMeal } = await import("./labels");
    expect(withArticle("Desayuno")).toBe("el desayuno");
    expect(withArticle("Merienda")).toBe("la merienda");
    expect(withArticle("Colaciones")).toBe("las colaciones");
    expect(agreeWithMeal("Desayuno", "repetido")).toBe("repetido");
    expect(agreeWithMeal("Cena", "repetido")).toBe("repetida");
    expect(agreeWithMeal("Colaciones", "repetido")).toBe("repetidas");
  });
});
