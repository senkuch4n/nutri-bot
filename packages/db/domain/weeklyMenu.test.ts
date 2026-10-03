// HU-018b: operaciones del menú semanal (prisma mockeado, patrón de appointments.test.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";

const delegate = () => ({
  findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn(),
  createMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn(),
});

const mocks = vi.hoisted(() => ({
  prisma: {} as Record<string, any>,
}));

vi.mock("../index", () => ({ prisma: mocks.prisma }));

import {
  MealModeError,
  MealOwnershipError,
  MealWeekdayMismatchError,
  assertWeekdayMatchesMeal,
  RecipeNotAvailableError,
  addRecipeItems,
  copyDay,
  moveMeal,
  nextItemOrder,
  removeMenuItems,
  repeatMealInAllDays,
  restoreMealSnapshots,
  setMealMode,
  setMealOptions,
  setRecipeItemPortions,
} from "./weeklyMenu";
import { addMeal, addMealItem, getPlanTarget } from "./nutritionPlans";
import { addTemplateMealItem, applyTemplateToPatient, createTemplate } from "./planTemplates";
import { createPlan } from "./nutritionPlans";
import { createPlanForConsultation } from "./consultations";

const p = () => mocks.prisma;
const item = (id: string, weekday: string | null, order = 0, extra: Record<string, unknown> = {}) => ({
  id, mealId: "meal1", foodId: `f-${id}`, customLabel: null, quantityGrams: { toString: () => "150.00" },
  notes: null, order, weekday, ...extra,
});
const meal = (mode: "EVERY_DAY" | "PER_DAY", items: unknown[], extra: Record<string, unknown> = {}) => ({
  id: "meal1", name: "Desayuno", order: 0, mode, isOptions: false, items, ...extra,
});
const createdRows = (d: ReturnType<typeof delegate>) => d.createMany.mock.calls.flatMap((c) => c[0].data);

beforeEach(() => {
  vi.resetAllMocks();
  for (const key of ["planMeal", "planMealItem", "templateMeal", "templateMealItem", "nutritionPlan", "nutritionPrescription", "consultation", "recipe"]) {
    mocks.prisma[key] = delegate();
  }
  mocks.prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
});

describe("setMealMode", () => {
  it("EVERY_DAY → PER_DAY copia cada ítem a los 7 días y borra los originales", async () => {
    p().planMeal.findFirst.mockResolvedValue(meal("EVERY_DAY", [item("a", null, 0), item("b", null, 1)], { isOptions: true }));
    const before = await setMealMode("plan", "plan1", "meal1", { mode: "PER_DAY" });

    expect(p().$transaction).toHaveBeenCalledTimes(1);
    expect(p().planMeal.findFirst.mock.calls[0][0].where).toEqual({ id: "meal1", planId: "plan1" });
    const rows = createdRows(p().planMealItem);
    expect(rows).toHaveLength(14);
    expect(rows.filter((r: any) => r.foodId === "f-a").map((r: any) => r.weekday)).toEqual(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
    expect(rows.filter((r: any) => r.foodId === "f-b").every((r: any) => r.order === 1 && r.quantityGrams === 150)).toBe(true);
    expect(rows.every((r: any) => r.mealId === "meal1")).toBe(true);
    expect(p().planMealItem.deleteMany).toHaveBeenCalledWith({ where: { mealId: "meal1", id: { in: ["a", "b"] } } });
    expect(p().planMeal.update).toHaveBeenCalledWith({ where: { id: "meal1" }, data: { mode: "PER_DAY", isOptions: false } });
    expect(before).toEqual({
      mealId: "meal1", mode: "EVERY_DAY", isOptions: true,
      items: [
        { foodId: "f-a", customLabel: null, quantityGrams: 150, notes: null, order: 0, weekday: null, recipeId: null, portions: null },
        { foodId: "f-b", customLabel: null, quantityGrams: 150, notes: null, order: 1, weekday: null, recipeId: null, portions: null },
      ],
    });
  });

  it("PER_DAY → EVERY_DAY conserva el día elegido y borra los otros filtrando por mealId", async () => {
    p().planMeal.findFirst.mockResolvedValue(meal("PER_DAY", [item("a", "MON"), item("b", "WED")]));
    await setMealMode("plan", "plan1", "meal1", { mode: "EVERY_DAY", keepWeekday: "WED" });
    expect(p().planMealItem.deleteMany).toHaveBeenCalledWith({ where: { mealId: "meal1", weekday: { not: "WED" } } });
    expect(p().planMealItem.updateMany).toHaveBeenCalledWith({ where: { mealId: "meal1", weekday: "WED" }, data: { weekday: null } });
    expect(p().planMeal.update).toHaveBeenCalledWith({ where: { id: "meal1" }, data: { mode: "EVERY_DAY" } });
    for (const call of p().planMealItem.deleteMany.mock.calls) expect(call[0].where.mealId).toBe("meal1");
  });

  it("mismo modo no escribe; comida de otro dueño → MealOwnershipError", async () => {
    p().planMeal.findFirst.mockResolvedValueOnce(meal("PER_DAY", []));
    await setMealMode("plan", "plan1", "meal1", { mode: "PER_DAY" });
    expect(p().planMeal.update).not.toHaveBeenCalled();
    p().planMeal.findFirst.mockResolvedValueOnce(null);
    await expect(setMealMode("plan", "otro", "meal1", { mode: "EVERY_DAY" })).rejects.toBeInstanceOf(MealOwnershipError);
  });

  it("kind template usa templateMeal / templateMealItem y templateId", async () => {
    p().templateMeal.findFirst.mockResolvedValue(meal("EVERY_DAY", [item("a", null)]));
    await setMealMode("template", "t1", "meal1", { mode: "PER_DAY" });
    expect(p().templateMeal.findFirst.mock.calls[0][0].where).toEqual({ id: "meal1", templateId: "t1" });
    expect(createdRows(p().templateMealItem)).toHaveLength(7);
    expect(p().planMealItem.createMany).not.toHaveBeenCalled();
  });
});

describe("setMealOptions", () => {
  it("en una comida PER_DAY → MealModeError y no escribe", async () => {
    p().planMeal.findFirst.mockResolvedValue(meal("PER_DAY", []));
    await expect(setMealOptions("plan", "plan1", "meal1", true)).rejects.toBeInstanceOf(MealModeError);
    expect(p().planMeal.update).not.toHaveBeenCalled();
  });
  it("en una EVERY_DAY la prende", async () => {
    p().templateMeal.findFirst.mockResolvedValue(meal("EVERY_DAY", []));
    await setMealOptions("template", "t1", "meal1", true);
    expect(p().templateMeal.update).toHaveBeenCalledWith({ where: { id: "meal1" }, data: { isOptions: true } });
  });
});

describe("copyDay", () => {
  it("solo toca comidas PER_DAY del dueño: borra TUE/WED y copia los ítems del lunes", async () => {
    p().planMeal.findMany.mockResolvedValue([
      meal("PER_DAY", [item("a", "MON", 0), item("b", "MON", 1), item("c", "TUE")], { id: "m1" }),
      meal("PER_DAY", [item("d", "FRI")], { id: "m2" }),
    ]);
    const snapshots = await copyDay("plan", "plan1", { from: "MON", to: ["TUE", "WED"] });
    expect(p().planMeal.findMany.mock.calls[0][0].where).toEqual({ planId: "plan1", mode: "PER_DAY" });
    expect(p().planMealItem.deleteMany.mock.calls.map((c: any) => c[0])).toEqual([
      { where: { mealId: "m1", weekday: { in: ["TUE", "WED"] } } },
      { where: { mealId: "m2", weekday: { in: ["TUE", "WED"] } } },
    ]);
    const rows = createdRows(p().planMealItem);
    expect(rows.map((r: any) => [r.mealId, r.foodId, r.weekday, r.order])).toEqual([
      ["m1", "f-a", "TUE", 0], ["m1", "f-b", "TUE", 1], ["m1", "f-a", "WED", 0], ["m1", "f-b", "WED", 1],
    ]);
    expect(snapshots.map((s) => s.mealId)).toEqual(["m1", "m2"]);
    expect(snapshots[0]!.items).toHaveLength(3);
  });
  it("to vacío, con el día de origen o repetido → error sin tocar la base", async () => {
    await expect(copyDay("plan", "plan1", { from: "MON", to: [] })).rejects.toBeInstanceOf(MealModeError);
    await expect(copyDay("plan", "plan1", { from: "MON", to: ["MON", "TUE"] })).rejects.toBeInstanceOf(MealModeError);
    await expect(copyDay("plan", "plan1", { from: "MON", to: ["TUE", "TUE"] })).rejects.toBeInstanceOf(MealModeError);
    expect(p().$transaction).not.toHaveBeenCalled();
  });
  it("template: filtra por templateId", async () => {
    p().templateMeal.findMany.mockResolvedValue([]);
    await copyDay("template", "t1", { from: "SUN", to: ["SAT"] });
    expect(p().templateMeal.findMany.mock.calls[0][0].where).toEqual({ templateId: "t1", mode: "PER_DAY" });
  });
});

describe("repeatMealInAllDays", () => {
  it("reemplaza los otros 6 días de esa comida", async () => {
    p().planMeal.findFirst.mockResolvedValue(meal("PER_DAY", [item("a", "MON"), item("x", "THU")]));
    const before = await repeatMealInAllDays("plan", "plan1", "meal1", "MON");
    expect(p().planMealItem.deleteMany).toHaveBeenCalledWith({
      where: { mealId: "meal1", weekday: { in: ["TUE", "WED", "THU", "FRI", "SAT", "SUN"] } },
    });
    expect(createdRows(p().planMealItem).map((r: any) => r.weekday)).toEqual(["TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
    expect(before.items).toHaveLength(2);
  });
  it("en una comida EVERY_DAY → MealModeError", async () => {
    p().planMeal.findFirst.mockResolvedValue(meal("EVERY_DAY", []));
    await expect(repeatMealInAllDays("plan", "plan1", "meal1", "MON")).rejects.toBeInstanceOf(MealModeError);
  });
});

describe("restoreMealSnapshots", () => {
  const snap = {
    mealId: "meal1", mode: "PER_DAY" as const, isOptions: false,
    items: [{ foodId: "f1", customLabel: null, quantityGrams: 80, notes: "n", order: 0, weekday: "MON" as const, recipeId: null, portions: null }],
  };
  it("borra los ítems de la comida, restaura el modo y recrea los de la foto", async () => {
    p().planMeal.count.mockResolvedValue(1);
    await restoreMealSnapshots("plan", "plan1", [snap]);
    expect(p().planMeal.count).toHaveBeenCalledWith({ where: { id: { in: ["meal1"] }, planId: "plan1" } });
    expect(p().planMealItem.deleteMany).toHaveBeenCalledWith({ where: { mealId: "meal1" } });
    expect(p().planMeal.update).toHaveBeenCalledWith({ where: { id: "meal1" }, data: { mode: "PER_DAY", isOptions: false } });
    expect(createdRows(p().planMealItem)).toEqual([
      { mealId: "meal1", foodId: "f1", customLabel: null, quantityGrams: 80, notes: "n", order: 0, weekday: "MON", recipeId: null, portions: null },
    ]);
  });
  it("comida de otro dueño → MealOwnershipError y no escribe nada", async () => {
    p().templateMeal.count.mockResolvedValue(0);
    await expect(restoreMealSnapshots("template", "t1", [snap])).rejects.toBeInstanceOf(MealOwnershipError);
    expect(p().templateMealItem.deleteMany).not.toHaveBeenCalled();
    expect(p().templateMeal.update).not.toHaveBeenCalled();
    expect(p().templateMealItem.createMany).not.toHaveBeenCalled();
  });
  it("una foto que rompe las invariantes → MealModeError", async () => {
    await expect(restoreMealSnapshots("plan", "plan1", [{ ...snap, isOptions: true }])).rejects.toBeInstanceOf(MealModeError);
    await expect(restoreMealSnapshots("plan", "plan1", [{ ...snap, mode: "EVERY_DAY" }])).rejects.toBeInstanceOf(MealModeError);
  });
});

describe("assertWeekdayMatchesMeal / nextItemOrder / moveMeal", () => {
  it("EVERY_DAY + día → error; PER_DAY + null → error; correctos pasan", async () => {
    p().planMeal.findUnique.mockResolvedValueOnce({ mode: "EVERY_DAY" });
    await expect(assertWeekdayMatchesMeal("plan", "meal1", "MON")).rejects.toBeInstanceOf(MealWeekdayMismatchError);
    p().planMeal.findUnique.mockResolvedValueOnce({ mode: "PER_DAY" });
    await expect(assertWeekdayMatchesMeal("plan", "meal1", null)).rejects.toBeInstanceOf(MealWeekdayMismatchError);
    p().templateMeal.findUnique.mockResolvedValueOnce({ mode: "PER_DAY" });
    await expect(assertWeekdayMatchesMeal("template", "meal1", "TUE")).resolves.toBeUndefined();
    p().planMeal.findUnique.mockResolvedValueOnce({ mode: "EVERY_DAY" });
    await expect(assertWeekdayMatchesMeal("plan", "meal1", null)).resolves.toBeUndefined();
  });
  it("nextItemOrder es el siguiente dentro de (mealId, weekday)", async () => {
    p().planMealItem.findFirst.mockResolvedValueOnce({ order: 2 });
    expect(await nextItemOrder("plan", "meal1", "TUE")).toBe(3);
    expect(p().planMealItem.findFirst.mock.calls[0][0].where).toEqual({ mealId: "meal1", weekday: "TUE" });
    p().planMealItem.findFirst.mockResolvedValueOnce(null);
    expect(await nextItemOrder("plan", "meal1", null)).toBe(0);
  });
  it("moveMeal up intercambia order con la anterior; en la primera no hace nada", async () => {
    p().planMeal.findFirst
      .mockResolvedValueOnce(meal("EVERY_DAY", [], { order: 3 }))
      .mockResolvedValueOnce({ id: "prev", order: 1 });
    await moveMeal("plan", "plan1", "meal1", "up");
    expect(p().planMeal.findFirst.mock.calls[1][0]).toEqual({
      where: { planId: "plan1", order: { lt: 3 } }, orderBy: { order: "desc" },
    });
    expect(p().planMeal.update.mock.calls.map((c: any) => c[0])).toEqual([
      { where: { id: "meal1" }, data: { order: 1 } },
      { where: { id: "prev" }, data: { order: 3 } },
    ]);

    vi.mocked(p().planMeal.update).mockClear();
    p().planMeal.findFirst.mockResolvedValueOnce(meal("EVERY_DAY", [], { order: 0 })).mockResolvedValueOnce(null);
    await moveMeal("plan", "plan1", "meal1", "up");
    expect(p().planMeal.update).not.toHaveBeenCalled();
  });
});

describe("nutritionPlans / planTemplates", () => {
  it("addMeal hereda PER_DAY si el plan ya es semanal; si no, EVERY_DAY", async () => {
    p().planMeal.count.mockResolvedValueOnce(2);
    await addMeal("plan1", { name: "Postre", order: 5 });
    expect(p().planMeal.create.mock.calls[0][0].data).toEqual({ planId: "plan1", name: "Postre", order: 5, mode: "PER_DAY", isOptions: false });
    p().planMeal.count.mockResolvedValueOnce(0);
    await addMeal("plan1", { name: "Postre", order: 5 });
    expect(p().planMeal.create.mock.calls[1][0].data.mode).toBe("EVERY_DAY");
    await addMeal("plan1", { name: "IA", order: 0, mode: "EVERY_DAY" });
    expect(p().planMeal.count).toHaveBeenCalledTimes(2);
  });
  it("addMealItem valida el día contra el modo y lo guarda", async () => {
    p().planMeal.findUnique.mockResolvedValueOnce({ mode: "EVERY_DAY" });
    await expect(addMealItem("meal1", { foodId: "f", order: 0, weekday: "MON" })).rejects.toBeInstanceOf(MealWeekdayMismatchError);
    expect(p().planMealItem.create).not.toHaveBeenCalled();
    p().planMeal.findUnique.mockResolvedValueOnce({ mode: "EVERY_DAY" });
    await addMealItem("meal1", { foodId: "f", order: 0 });
    expect(p().planMealItem.create.mock.calls[0][0].data).toEqual({ mealId: "meal1", foodId: "f", order: 0, weekday: null });
    p().templateMeal.findUnique.mockResolvedValueOnce({ mode: "PER_DAY" });
    await addTemplateMealItem("meal1", { foodId: "f", order: 2, weekday: "SAT" });
    expect(p().templateMealItem.create.mock.calls[0][0].data.weekday).toBe("SAT");
  });

  const prescription = (id: string) => ({
    prescribedVctKcal: 1800, proteinG: 110, carbG: 200, fatG: 60,
    consultation: { id, consultedAt: new Date("2026-09-12T15:00:00Z") },
  });
  it("getPlanTarget prefiere la consulta del plan", async () => {
    p().nutritionPlan.findUnique.mockResolvedValue({ patientId: "pat1" });
    p().nutritionPrescription.findFirst.mockResolvedValueOnce(prescription("c-plan"));
    expect(await getPlanTarget("plan1")).toEqual({
      kcal: 1800, protein: 110, carbs: 200, fat: 60, consultationId: "c-plan",
      consultedAt: new Date("2026-09-12T15:00:00Z"), source: "PLAN_CONSULTATION",
    });
    const args = p().nutritionPrescription.findFirst.mock.calls[0][0];
    expect(args.where).toEqual({ consultation: { planId: "plan1" } });
    expect(args.orderBy).toEqual([{ consultation: { consultedAt: "desc" } }, { consultation: { createdAt: "desc" } }]);
  });
  it("getPlanTarget: si el plan no tiene, la más reciente del paciente; si no hay, null", async () => {
    p().nutritionPlan.findUnique.mockResolvedValue({ patientId: "pat1" });
    p().nutritionPrescription.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(prescription("c-last"));
    const target = await getPlanTarget("plan1");
    expect(target?.source).toBe("LATEST");
    expect(target?.consultationId).toBe("c-last");
    expect(p().nutritionPrescription.findFirst.mock.calls[1][0].where).toEqual({ consultation: { patientId: "pat1" } });

    p().nutritionPrescription.findFirst.mockResolvedValue(null);
    expect(await getPlanTarget("plan1")).toBeNull();
    p().nutritionPlan.findUnique.mockResolvedValue(null);
    expect(await getPlanTarget("nope")).toBeNull();
  });

  it("applyTemplateToPatient copia mode, isOptions y weekday", async () => {
    p().templateMeal; // los delegados existen
    mocks.prisma.planTemplate = { findUnique: vi.fn().mockResolvedValue({
      id: "t1", title: "Semanal", notes: null,
      meals: [
        { name: "Desayuno", order: 0, mode: "PER_DAY", isOptions: false, items: [
          { ...item("a", "TUE"), quantityGrams: 120, recipeId: null, portions: null },
          { ...item("r", "THU", 1), foodId: null, quantityGrams: null, recipeId: "rec1", portions: { toString: () => "1.5" } },
        ] },
        { name: "Colaciones", order: 1, mode: "EVERY_DAY", isOptions: true, items: [{ ...item("b", null), quantityGrams: null }] },
      ],
    }) };
    p().nutritionPlan.create = vi.fn().mockResolvedValue({ id: "newplan" });
    await applyTemplateToPatient("t1", "pat1");
    const created = p().nutritionPlan.create.mock.calls[0][0].data.meals.create;
    expect(created.map((m: any) => [m.name, m.mode, m.isOptions])).toEqual([["Desayuno", "PER_DAY", false], ["Colaciones", "EVERY_DAY", true]]);
    expect(created[0].items.create[0].weekday).toBe("TUE");
    expect(created[0].items.create[0]).toMatchObject({ recipeId: null, portions: null });
    // HU-018c: el ítem de receta se copia con su receta, sus porciones y su día.
    expect(created[0].items.create[1]).toMatchObject({ foodId: null, quantityGrams: null, recipeId: "rec1", weekday: "THU", order: 1 });
    expect(String(created[0].items.create[1].portions)).toBe("1.5");
    expect(created[1].items.create[0].weekday).toBeNull();
    // Copia exacta: aplicar una plantilla no agrega las comidas por defecto (12-D4).
    expect(p().planMeal.createMany).not.toHaveBeenCalled();
  });
});

// 018b-2 (E1): plan, plantilla y plan de consulta nuevos traen DEFAULT_WEEKLY_MEALS.
const DEFAULTS = [
  ["Desayuno", 0, "PER_DAY", false], ["Almuerzo", 1, "PER_DAY", false], ["Merienda", 2, "PER_DAY", false],
  ["Cena", 3, "PER_DAY", false], ["Colaciones", 4, "EVERY_DAY", true],
];
const defaultsOf = (d: ReturnType<typeof delegate>, ownerKey: string, ownerId: string) =>
  createdRows(d).map((r: any) => { expect(r[ownerKey]).toBe(ownerId); return [r.name, r.order, r.mode, r.isOptions]; });

describe("comidas por defecto (018b-2)", () => {
  it("createPlan crea el plan DRAFT y las 5 comidas en la misma transacción", async () => {
    p().nutritionPlan.create.mockResolvedValue({ id: "plan9" });
    const plan = await createPlan("pat1", { title: "Plan de octubre" });
    expect(plan).toEqual({ id: "plan9" });
    expect(p().$transaction).toHaveBeenCalledTimes(1);
    expect(p().nutritionPlan.create).toHaveBeenCalledWith({ data: { patientId: "pat1", title: "Plan de octubre", status: "DRAFT" } });
    expect(defaultsOf(p().planMeal, "planId", "plan9")).toEqual(DEFAULTS);
  });

  it("createTemplate crea la plantilla con las mismas 5 comidas", async () => {
    mocks.prisma.planTemplate = { create: vi.fn().mockResolvedValue({ id: "tpl9" }) };
    const template = await createTemplate({ title: "Semanal", notes: null });
    expect(template).toEqual({ id: "tpl9" });
    expect(p().$transaction).toHaveBeenCalledTimes(1);
    expect(defaultsOf(p().templateMeal, "templateId", "tpl9")).toEqual(DEFAULTS);
    expect(p().planMeal.createMany).not.toHaveBeenCalled();
  });

  it("createPlanForConsultation crea las 5 comidas y vincula el plan a la consulta", async () => {
    mocks.prisma.professional = { findUnique: vi.fn().mockResolvedValue({ id: 1, timezone: "America/Argentina/Buenos_Aires" }) };
    p().consultation.findUniqueOrThrow = vi.fn().mockResolvedValue({ id: "c1", patientId: "pat1", consultedAt: new Date("2026-09-12T15:00:00Z") });
    p().nutritionPlan.create.mockResolvedValue({ id: "plan10" });
    const plan = await createPlanForConsultation({ consultationId: "c1" });
    expect(plan).toEqual({ id: "plan10" });
    expect(p().nutritionPlan.create.mock.calls[0][0].data).toMatchObject({ patientId: "pat1", title: "Plan del 12/09/2026", status: "DRAFT" });
    expect(defaultsOf(p().planMeal, "planId", "plan10")).toEqual(DEFAULTS);
    expect(p().consultation.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { planId: "plan10" } });
  });
});

// ─── HU-018c: ítems de receta ───────────────────────────────────────────────────

const recipeItem = (id: string, weekday: string | null, portions = "1.5") =>
  item(id, weekday, 0, { foodId: null, quantityGrams: null, recipeId: "rec1", portions: { toString: () => portions } });

describe("fotos con recetas (018c)", () => {
  it("copyDay, repeatMealInAllDays y setMealMode copian recipeId y portions", async () => {
    p().planMeal.findMany.mockResolvedValue([meal("PER_DAY", [recipeItem("r", "MON"), item("a", "MON", 1)], { id: "m1" })]);
    const snapshots = await copyDay("plan", "plan1", { from: "MON", to: ["FRI"] });
    expect(createdRows(p().planMealItem)[0]).toEqual({
      mealId: "m1", foodId: null, customLabel: null, quantityGrams: null, notes: null, order: 0, weekday: "FRI", recipeId: "rec1", portions: 1.5,
    });
    expect(createdRows(p().planMealItem)[1]).toMatchObject({ foodId: "f-a", recipeId: null, portions: null });
    expect(snapshots[0]!.items[0]).toMatchObject({ recipeId: "rec1", portions: 1.5 });

    vi.mocked(p().planMealItem.createMany).mockClear();
    p().planMeal.findFirst.mockResolvedValueOnce(meal("PER_DAY", [recipeItem("r", "TUE")]));
    await repeatMealInAllDays("plan", "plan1", "meal1", "TUE");
    expect(createdRows(p().planMealItem).every((r: any) => r.recipeId === "rec1" && r.portions === 1.5 && r.foodId === null)).toBe(true);

    vi.mocked(p().templateMealItem.createMany).mockClear();
    p().templateMeal.findFirst.mockResolvedValueOnce(meal("EVERY_DAY", [recipeItem("r", null, "2")]));
    await setMealMode("template", "t1", "meal1", { mode: "PER_DAY" });
    const rows = createdRows(p().templateMealItem);
    expect(rows).toHaveLength(7);
    expect(rows.every((r: any) => r.recipeId === "rec1" && r.portions === 2)).toBe(true);
  });

  it("restoreMealSnapshots recrea los ítems de receta", async () => {
    p().planMeal.count.mockResolvedValue(1);
    await restoreMealSnapshots("plan", "plan1", [{
      mealId: "meal1", mode: "PER_DAY", isOptions: false,
      items: [{ foodId: null, customLabel: null, quantityGrams: null, notes: null, order: 0, weekday: "MON", recipeId: "rec1", portions: 0.5 }],
    }]);
    expect(createdRows(p().planMealItem)).toEqual([
      { mealId: "meal1", foodId: null, customLabel: null, quantityGrams: null, notes: null, order: 0, weekday: "MON", recipeId: "rec1", portions: 0.5 },
    ]);
  });

  it("una foto con receta y alimento, o porciones sin receta, da MealModeError sin escribir", async () => {
    const base = { foodId: null, customLabel: null, quantityGrams: null, notes: null, order: 0, weekday: "MON" as const, recipeId: "rec1", portions: 1 };
    const bad = [
      { ...base, foodId: "f1" },
      { ...base, quantityGrams: 100 },
      { ...base, portions: null },
      { ...base, portions: 0.7 },
      { ...base, recipeId: null, foodId: "f1", portions: 1 },
    ];
    for (const i of bad) {
      await expect(restoreMealSnapshots("plan", "plan1", [{ mealId: "meal1", mode: "PER_DAY", isOptions: false, items: [i] }]))
        .rejects.toBeInstanceOf(MealModeError);
    }
    expect(p().$transaction).not.toHaveBeenCalled();
  });
});

describe("addRecipeItems", () => {
  const published = () => p().recipe.findUnique.mockResolvedValue({ status: "PUBLISHED" });
  it("PER_DAY con [THU, TUE]: 2 ítems de receta, order = máximo + 1, ids en orden de la semana, 1 transacción", async () => {
    p().planMeal.findFirst.mockResolvedValue(meal("PER_DAY", []));
    published();
    p().planMealItem.findFirst.mockResolvedValueOnce({ order: 2 }).mockResolvedValueOnce(null);
    p().planMealItem.create.mockResolvedValueOnce({ id: "new-tue" }).mockResolvedValueOnce({ id: "new-thu" });
    const result = await addRecipeItems("plan", "plan1", { mealId: "meal1", recipeId: "rec1", weekdays: ["THU", "TUE"] });
    expect(result).toEqual({ itemIds: ["new-tue", "new-thu"] });
    expect(p().$transaction).toHaveBeenCalledTimes(1);
    expect(p().planMeal.findFirst.mock.calls[0][0].where).toEqual({ id: "meal1", planId: "plan1" });
    expect(p().recipe.findUnique).toHaveBeenCalledWith({ where: { id: "rec1" }, select: { status: true } });
    expect(p().planMealItem.findFirst.mock.calls.map((c: any) => c[0].where)).toEqual([
      { mealId: "meal1", weekday: "TUE" }, { mealId: "meal1", weekday: "THU" },
    ]);
    expect(p().planMealItem.create.mock.calls.map((c: any) => c[0].data)).toEqual([
      { mealId: "meal1", recipeId: "rec1", portions: 1, weekday: "TUE", order: 3, foodId: null, quantityGrams: null, customLabel: null, notes: null },
      { mealId: "meal1", recipeId: "rec1", portions: 1, weekday: "THU", order: 0, foodId: null, quantityGrams: null, customLabel: null, notes: null },
    ]);
  });

  it("EVERY_DAY con null → 1 ítem sin día; con días → error; PER_DAY con null o [] → error", async () => {
    published();
    p().planMeal.findFirst.mockResolvedValueOnce(meal("EVERY_DAY", []));
    p().planMealItem.findFirst.mockResolvedValueOnce(null);
    p().planMealItem.create.mockResolvedValueOnce({ id: "x" });
    expect(await addRecipeItems("plan", "plan1", { mealId: "meal1", recipeId: "rec1", portions: 2, weekdays: null })).toEqual({ itemIds: ["x"] });
    expect(p().planMealItem.create.mock.calls[0][0].data).toMatchObject({ weekday: null, portions: 2 });

    vi.mocked(p().planMealItem.create).mockClear();
    p().planMeal.findFirst.mockResolvedValueOnce(meal("EVERY_DAY", []));
    await expect(addRecipeItems("plan", "plan1", { mealId: "meal1", recipeId: "rec1", weekdays: ["MON"] })).rejects.toBeInstanceOf(MealWeekdayMismatchError);
    p().planMeal.findFirst.mockResolvedValueOnce(meal("PER_DAY", []));
    await expect(addRecipeItems("plan", "plan1", { mealId: "meal1", recipeId: "rec1", weekdays: null })).rejects.toBeInstanceOf(MealWeekdayMismatchError);
    p().planMeal.findFirst.mockResolvedValueOnce(meal("PER_DAY", []));
    await expect(addRecipeItems("plan", "plan1", { mealId: "meal1", recipeId: "rec1", weekdays: [] })).rejects.toBeInstanceOf(MealWeekdayMismatchError);
    p().planMeal.findFirst.mockResolvedValueOnce(meal("PER_DAY", []));
    await expect(addRecipeItems("plan", "plan1", { mealId: "meal1", recipeId: "rec1", weekdays: ["MON", "MON"] })).rejects.toBeInstanceOf(MealWeekdayMismatchError);
    expect(p().planMealItem.create).not.toHaveBeenCalled();
  });

  it.each([["DRAFT"], ["ARCHIVED"], [null]])("receta %s → RecipeNotAvailableError sin create", async (status) => {
    p().planMeal.findFirst.mockResolvedValue(meal("PER_DAY", []));
    p().recipe.findUnique.mockResolvedValue(status ? { status } : null);
    await expect(addRecipeItems("plan", "plan1", { mealId: "meal1", recipeId: "rec1", weekdays: ["MON"] })).rejects.toBeInstanceOf(RecipeNotAvailableError);
    expect(p().planMealItem.create).not.toHaveBeenCalled();
  });

  it("comida de otro dueño → MealOwnershipError; porciones 0,3 → RangeError", async () => {
    p().planMeal.findFirst.mockResolvedValue(null);
    await expect(addRecipeItems("plan", "otro", { mealId: "meal1", recipeId: "rec1", weekdays: ["MON"] })).rejects.toBeInstanceOf(MealOwnershipError);
    await expect(addRecipeItems("plan", "plan1", { mealId: "meal1", recipeId: "rec1", portions: 0.3, weekdays: ["MON"] })).rejects.toBeInstanceOf(RangeError);
    expect(p().planMealItem.create).not.toHaveBeenCalled();
  });

  it("kind template usa templateMeal / templateMealItem", async () => {
    p().templateMeal.findFirst.mockResolvedValue(meal("PER_DAY", []));
    published();
    p().templateMealItem.findFirst.mockResolvedValue(null);
    p().templateMealItem.create.mockResolvedValue({ id: "t-item" });
    await addRecipeItems("template", "t1", { mealId: "meal1", recipeId: "rec1", weekdays: ["SUN"] });
    expect(p().templateMeal.findFirst.mock.calls[0][0].where).toEqual({ id: "meal1", templateId: "t1" });
    expect(p().templateMealItem.create).toHaveBeenCalledTimes(1);
    expect(p().planMealItem.create).not.toHaveBeenCalled();
  });
});

describe("setRecipeItemPortions / removeMenuItems", () => {
  it("filtra por receta y dueño; 1,5 actualiza; 5 → RangeError; sin ítem → MealOwnershipError", async () => {
    p().planMealItem.findFirst.mockResolvedValueOnce({ id: "it1" });
    await setRecipeItemPortions("plan", "plan1", "it1", 1.5);
    expect(p().planMealItem.findFirst.mock.calls[0][0].where).toEqual({ id: "it1", recipeId: { not: null }, meal: { planId: "plan1" } });
    expect(p().planMealItem.update).toHaveBeenCalledWith({ where: { id: "it1" }, data: { portions: 1.5 } });

    await expect(setRecipeItemPortions("plan", "plan1", "it1", 5)).rejects.toBeInstanceOf(RangeError);
    p().templateMealItem.findFirst.mockResolvedValueOnce(null);
    await expect(setRecipeItemPortions("template", "t1", "it1", 1)).rejects.toBeInstanceOf(MealOwnershipError);
    expect(p().templateMealItem.findFirst.mock.calls[0][0].where.meal).toEqual({ templateId: "t1" });
    expect(p().planMealItem.update).toHaveBeenCalledTimes(1);
  });

  it("removeMenuItems borra solo esos ids del dueño; [] o 51 ids → RangeError", async () => {
    p().planMealItem.deleteMany.mockResolvedValue({ count: 2 });
    expect(await removeMenuItems("plan", "plan1", ["a", "b"])).toBe(2);
    expect(p().planMealItem.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["a", "b"] }, meal: { planId: "plan1" } } });
    await expect(removeMenuItems("plan", "plan1", [])).rejects.toBeInstanceOf(RangeError);
    await expect(removeMenuItems("plan", "plan1", Array.from({ length: 51 }, (_, i) => `i${i}`))).rejects.toBeInstanceOf(RangeError);
    expect(p().planMealItem.deleteMany).toHaveBeenCalledTimes(1);
  });
});
