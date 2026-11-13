import { describe, expect, it } from "vitest";
import { sumMacros, type Macros } from "./nutrition";
import {
  DEFAULT_WEEKLY_MEALS,
  WEEKDAYS,
  WEEKDAY_LABELS,
  compareToTarget,
  computeWeeklyItemWeights,
  computeWeeklyTotals,
  formatTargetStatus,
  isWeekday,
  isWeeklyMenu,
  itemsForDay,
  joinWeekdaysEs,
  mealTotalForDay,
  summarizeDayStatus,
  summarizeOptions,
  weekdayInTimeZone,
  type Weekday,
  type WeeklyMenuMeal,
} from "./weekly-menu";

const m = (kcal: number, protein = 0, carbs = 0, fat = 0, fiber = 0): Macros => ({ kcal, protein, carbs, fat, fiber });
let seq = 0;
const item = (macros: Macros | null, weekday: Weekday | null = null) => ({ id: `i${++seq}`, weekday, macros });
const everyDay = (items: ReturnType<typeof item>[], isOptions = false): WeeklyMenuMeal => ({
  id: `m${++seq}`, mode: "EVERY_DAY", isOptions, items,
});
const perDay = (items: ReturnType<typeof item>[]): WeeklyMenuMeal => ({ id: `m${++seq}`, mode: "PER_DAY", isOptions: false, items });

describe("constantes", () => {
  it("tiene los 7 días en orden y sus rótulos", () => {
    expect(WEEKDAYS).toEqual(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
    expect(WEEKDAY_LABELS.TUE).toEqual({ short: "Mar", long: "Martes", lower: "martes" });
    expect(isWeekday("SUN")).toBe(true);
    expect(isWeekday("lun")).toBe(false);
  });
  it("las comidas por defecto: 4 PER_DAY y Colaciones EVERY_DAY con opciones", () => {
    expect(DEFAULT_WEEKLY_MEALS).toHaveLength(5);
    expect(DEFAULT_WEEKLY_MEALS.slice(0, 4).map((x) => [x.name, x.mode, x.isOptions])).toEqual([
      ["Desayuno", "PER_DAY", false], ["Almuerzo", "PER_DAY", false],
      ["Merienda", "PER_DAY", false], ["Cena", "PER_DAY", false],
    ]);
    expect(DEFAULT_WEEKLY_MEALS[4]).toEqual({ name: "Colaciones", mode: "EVERY_DAY", isOptions: true });
  });
});

describe("isWeeklyMenu / itemsForDay", () => {
  it("es semanal solo si alguna comida es PER_DAY", () => {
    expect(isWeeklyMenu([])).toBe(false);
    expect(isWeeklyMenu([{ mode: "EVERY_DAY" }, { mode: "EVERY_DAY" }])).toBe(false);
    expect(isWeeklyMenu([{ mode: "EVERY_DAY" }, { mode: "PER_DAY" }])).toBe(true);
  });
  it("EVERY_DAY devuelve todos; PER_DAY solo los del día", () => {
    const a = item(m(1)), b = item(m(2));
    expect(itemsForDay(everyDay([a, b]), "WED")).toEqual([a, b]);
    const mon = item(m(1), "MON"), tue = item(m(2), "TUE");
    expect(itemsForDay(perDay([mon, tue]), "TUE")).toEqual([tue]);
    expect(itemsForDay(perDay([mon, tue]), "SUN")).toEqual([]);
  });
});

describe("computeWeeklyTotals", () => {
  it("plan migrado: los 7 días y el promedio son exactamente sumMacros(todos los ítems)", () => {
    const macros = [m(12.3, 1.1, 2.2, 0.3, 0.1), m(45.6, 3.3, 4.4, 0.7, 0.2), m(0.1, 0.1, 0.1, 0.1, 0.1), m(333.33, 7.77, 9.99, 1.11, 2.22)];
    const meals = [
      everyDay([item(macros[0]!), item(null)]),
      everyDay([item(macros[1]!), item(macros[2]!)]),
      everyDay([item(macros[3]!), item(null)]),
    ];
    const expected = sumMacros(macros);
    const totals = computeWeeklyTotals(meals);
    expect(totals.isWeekly).toBe(false);
    expect(totals.loadedDays).toEqual(WEEKDAYS);
    for (const day of WEEKDAYS) {
      expect(totals.days[day].macros).toEqual(expected);
      expect(totals.days[day].loaded).toBe(true);
    }
    expect(totals.weeklyAverage).toEqual(expected);
  });
  it("plan vacío: ningún día cargado, promedio null y totales en 0", () => {
    const totals = computeWeeklyTotals([everyDay([]), perDay([])]);
    expect(totals.loadedDays).toEqual([]);
    expect(totals.weeklyAverage).toBeNull();
    expect(totals.days.MON).toEqual({ macros: m(0), loaded: false });
    expect(computeWeeklyTotals([]).weeklyAverage).toBeNull();
  });
  it("varios ítems se suman: el desayuno del martes con 3 ítems", () => {
    const breakfast = perDay([item(m(100, 5), "TUE"), item(m(200, 6), "TUE"), item(m(50.5, 1), "TUE"), item(m(999), "MON")]);
    expect(mealTotalForDay(breakfast, "TUE")).toEqual({ macros: m(350.5, 12), optionsRange: null, itemCount: 3 });
  });
  it("comida con opciones: suma el promedio y muestra el rango", () => {
    const snacks = everyDay([item(m(180, 3)), item(m(80, 1)), item(m(70, 2))], true);
    const total = mealTotalForDay(snacks, "MON");
    expect(total.macros.kcal).toBe(110);
    expect(total.macros.protein).toBe(2);
    expect(total.optionsRange).toEqual({ minKcal: 70, maxKcal: 180 });
    expect(total.itemCount).toBe(3);
    const lunch = perDay([item(m(500), "MON")]);
    expect(computeWeeklyTotals([lunch, snacks]).days.MON.macros.kcal).toBe(610);
  });
  it("las opciones de texto libre no cuentan; todas sin macros → null y suma 0", () => {
    expect(summarizeOptions([m(180), null, m(70)])).toEqual({ average: m(125), minKcal: 70, maxKcal: 180, countedOptions: 2 });
    expect(summarizeOptions([null, null])).toBeNull();
    const snacks = everyDay([item(null), item(null)], true);
    expect(mealTotalForDay(snacks, "FRI")).toEqual({ macros: m(0), optionsRange: null, itemCount: 2 });
  });
  it("día vacío: el jueves sin PER_DAY no está cargado y no entra en el promedio", () => {
    const daily = everyDay([item(m(100))]);
    const lunch = perDay(WEEKDAYS.filter((d) => d !== "THU").map((d) => item(m(500), d)));
    const totals = computeWeeklyTotals([lunch, daily]);
    expect(totals.isWeekly).toBe(true);
    expect(totals.days.THU).toEqual({ macros: m(100), loaded: false });
    expect(totals.loadedDays).toHaveLength(6);
    expect(totals.weeklyAverage?.kcal).toBe(600);
  });
  it("promedio de los días cargados: lunes 1.800 y martes 1.600 → 1.700", () => {
    const totals = computeWeeklyTotals([perDay([item(m(1800, 90), "MON"), item(m(1600, 81), "TUE")])]);
    expect(totals.loadedDays).toEqual(["MON", "TUE"]);
    expect(totals.weeklyAverage).toEqual(m(1700, 85.5));
  });
});

describe("computeWeeklyItemWeights", () => {
  it("plan migrado: todos los pesos son 1", () => {
    const meals = [everyDay([item(m(1)), item(null)]), everyDay([item(m(2))])];
    expect(Object.values(computeWeeklyItemWeights(meals))).toEqual([1, 1, 1]);
  });
  it("PER_DAY con 4 días cargados → 0,25; opciones 2 de 3 con macros → 0,5, 0,5 y 0", () => {
    const lunch = perDay([item(m(400, 20), "MON"), item(m(600, 30), "TUE"), item(m(500, 25), "WED"), item(m(700, 35), "THU")]);
    const snacks = everyDay([item(m(100, 2)), item(m(200, 4)), item(null)], true);
    const daily = everyDay([item(m(50, 1))]);
    const meals = [lunch, snacks, daily];
    const weights = computeWeeklyItemWeights(meals);
    for (const it of lunch.items) expect(weights[it.id]).toBe(0.25);
    expect(snacks.items.map((it) => weights[it.id])).toEqual([0.5, 0.5, 0]);
    expect(weights[daily.items[0]!.id]).toBe(1);

    const weighted = meals.flatMap((meal) => meal.items).reduce(
      (acc, it) => acc + (it.macros?.kcal ?? 0) * weights[it.id]!, 0);
    expect(Math.abs(weighted - computeWeeklyTotals(meals).weeklyAverage!.kcal)).toBeLessThanOrEqual(0.1);
  });
  it("sin días cargados y con ítems EVERY_DAY usa n = 1", () => {
    const meals = [perDay([]), everyDay([item(m(10))])];
    expect(Object.values(computeWeeklyItemWeights(meals))).toEqual([1]);
  });
});

describe("objetivo (D14: ±5 %)", () => {
  it("compareToTarget incluye los bordes y devuelve la diferencia", () => {
    expect(compareToTarget(1710, 1800)).toEqual({ kind: "ON_TARGET" });
    expect(compareToTarget(1890, 1800)).toEqual({ kind: "ON_TARGET" });
    expect(compareToTarget(1709, 1800)).toEqual({ kind: "UNDER", missing: 91 });
    expect(compareToTarget(1891, 1800)).toEqual({ kind: "OVER", excess: 91 });
    expect(compareToTarget(100, 0)).toBeNull();
  });
  it("formatTargetStatus", () => {
    expect(formatTargetStatus({ kind: "UNDER", missing: 560 }, "kcal")).toBe("Faltan 560 kcal");
    expect(formatTargetStatus({ kind: "UNDER", missing: 1.2 }, "g")).toBe("Falta 1 g");
    expect(formatTargetStatus({ kind: "OVER", excess: 12 }, "g")).toBe("Se pasa 12 g");
    expect(formatTargetStatus({ kind: "ON_TARGET" }, "kcal")).toBe("En objetivo");
    expect(formatTargetStatus({ kind: "UNDER", missing: 1240 }, "kcal")).toBe("Faltan 1.240 kcal");
  });
  it("summarizeDayStatus", () => {
    const target = { kcal: 1800, protein: 110, carbs: 200, fat: 60 };
    expect(summarizeDayStatus(m(1500, 110, 200, 60), target)).toBe("Faltan 300 kcal");
    expect(summarizeDayStatus(m(1800, 110, 200, 75), target)).toBe("Se pasa 15 g G");
    expect(summarizeDayStatus(m(1780, 108, 195, 62), target)).toBe("En objetivo");
    expect(summarizeDayStatus(m(1800, 80, 200, 60), target)).toBe("Faltan 30 g P");
    // El mayor exceso relativo gana: kcal +6,7 % contra grasas +25 %.
    expect(summarizeDayStatus(m(1920, 110, 200, 75), target)).toBe("Se pasa 15 g G");
    expect(summarizeDayStatus(m(2100, 110, 200, 61), target)).toBe("Se pasa 300 kcal");
  });
});

describe("joinWeekdaysEs / weekdayInTimeZone", () => {
  it("une los días en castellano", () => {
    expect(joinWeekdaysEs(["TUE"])).toBe("martes");
    expect(joinWeekdaysEs(["TUE", "WED"])).toBe("martes y miércoles");
    expect(joinWeekdaysEs(["TUE", "WED", "THU"])).toBe("martes, miércoles y jueves");
    expect(joinWeekdaysEs(["TUE", "WED"], "long")).toBe("Martes y Miércoles");
    expect(joinWeekdaysEs([])).toBe("");
  });
  it("usa la zona horaria para decidir el día", () => {
    const instant = new Date("2026-10-05T02:00:00Z");
    expect(weekdayInTimeZone(instant, "America/Argentina/Buenos_Aires")).toBe("SUN");
    expect(weekdayInTimeZone(instant, "UTC")).toBe("MON");
  });
});
