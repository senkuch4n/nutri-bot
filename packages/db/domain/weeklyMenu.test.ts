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
  renameMeal,
  restoreMealSnapshots,
  setMealMode,
  setMealOptions,
  setMeasureItemQuantity,
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
const tenantTemplate = { templateId: "t1", template: { tenantId: "tenant-a" } };
const tenantRecipeItem = item("rec-item", "MON", 0, { foodId: null, quantityGrams: null, recipeId: "recipe-b", portions: 1 });

const createdRows = (d: ReturnType<typeof delegate>) => d.createMany.mock.calls.flatMap((c) => c[0].data);

beforeEach(() => {
  vi.resetAllMocks();
  for (const key of ["planMeal", "planMealItem", "templateMeal", "templateMealItem", "nutritionPlan", "nutritionPrescription", "consultation", "recipe", "planTemplate"]) {
    mocks.prisma[key] = delegate();
  }
  mocks.prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
});

describe("recipe references from an owned plan", () => {
  it.each(["copy", "repeat", "restore", "mode", "add"] as const)("%s rejects a known foreign recipe before writes", async (operation) => {
    const perDay = meal("PER_DAY", [tenantRecipeItem]);
    p().planMeal.findMany.mockResolvedValue([perDay]);
    p().planMeal.findFirst.mockResolvedValue(operation === "mode" ? meal("EVERY_DAY", [tenantRecipeItem]) : perDay);
    p().planMeal.count.mockResolvedValue(1);
    p().nutritionPlan.findUnique.mockResolvedValue({ tenantId: "tenant-a" });
    p().recipe.count.mockResolvedValue(0);
    p().recipe.findUnique.mockResolvedValue({ status: "PUBLISHED", tenantId: "tenant-b" });
    p().planMealItem.create.mockResolvedValue({ id: "inserted" });
    const run = {
      copy: () => copyDay("plan", "p1", { from: "MON", to: ["TUE"] }),
      repeat: () => repeatMealInAllDays("plan", "p1", "meal1", "MON"),
      restore: () => restoreMealSnapshots("plan", "p1", [{ mealId: "meal1", mode: "PER_DAY", isOptions: false,
        items: [{ ...tenantRecipeItem, weekday: "MON", quantityGrams: null, foodId: null, recipeId: "recipe-b", portions: 1,
          customLabel: null, notes: null, measureQty: null, measureName: null, measurePlural: null, measureGrams: null }],
      }]),
      mode: () => setMealMode("plan", "p1", "meal1", { mode: "PER_DAY" }),
      add: () => addRecipeItems("plan", "p1", { mealId: "meal1", recipeId: "recipe-b", weekdays: ["MON"] }),
    };
    await expect(run[operation]()).rejects.toThrow("La receta no pertenece a este consultorio.");
    for (const method of ["deleteMany", "createMany", "create", "updateMany"]) {
      expect(p().planMealItem[method]).not.toHaveBeenCalled();
    }
    expect(p().planMeal.update).not.toHaveBeenCalled();
  });

  it.each(["tenant-a", null])("preserves copying a recipe with owner %s from an owned plan", async (recipeOwner) => {
    p().planMeal.findMany.mockResolvedValue([meal("PER_DAY", [tenantRecipeItem])]);
    p().nutritionPlan.findUnique.mockResolvedValue({ tenantId: "tenant-a" });
    p().recipe.count.mockImplementation(({ where }: { where: { OR: { tenantId: string | null }[] } }) =>
      where.OR.some(({ tenantId }) => tenantId === recipeOwner) ? 1 : 0);
    await copyDay("plan", "p1", { from: "MON", to: ["TUE"] });
    expect(createdRows(p().planMealItem)).toMatchObject([{ weekday: "TUE", recipeId: "recipe-b" }]);
  });
});

describe("tenant-scoped weekly template operations", () => {
  it("rejects copying an unknown or foreign template, even if it has no weekly meals", async () => {
    p().planTemplate.findUnique.mockResolvedValue(null);
    p().templateMeal.findMany.mockResolvedValue([]);
    await expect(copyDay("template", "t1", { from: "MON", to: ["TUE"] }, "tenant-a")).rejects.toBeInstanceOf(MealOwnershipError);
    expect(p().planTemplate.findUnique).toHaveBeenCalledWith({ where: { id: "t1", tenantId: "tenant-a" }, select: { id: true } });
    expect(p().templateMeal.findMany).not.toHaveBeenCalled();
    expect(p().templateMealItem.deleteMany).not.toHaveBeenCalled();
  });

  it.each(["copy", "repeat", "restore"] as const)("%s rejects a foreign recipe without mutations", async (operation) => {
    p().planTemplate.findUnique.mockResolvedValue({ id: "t1" });
    p().templateMeal.findMany.mockResolvedValue([meal("PER_DAY", [tenantRecipeItem])]);
    p().templateMeal.findFirst.mockResolvedValue(meal("PER_DAY", [tenantRecipeItem]));
    p().templateMeal.count.mockResolvedValue(1);
    p().recipe.count.mockResolvedValue(0);
    const run = {
      copy: () => copyDay("template", "t1", { from: "MON", to: ["TUE"] }, "tenant-a"),
      repeat: () => repeatMealInAllDays("template", "t1", "meal1", "MON", "tenant-a"),
      restore: () => restoreMealSnapshots("template", "t1", [{ mealId: "meal1", mode: "PER_DAY", isOptions: false,
        items: [{ foodId: null, customLabel: null, quantityGrams: null, notes: null, order: 0, weekday: "MON", recipeId: "recipe-b", portions: 1, measureQty: null, measureName: null, measurePlural: null, measureGrams: null }],
      }], "tenant-a"),
    };
    await expect(run[operation]()).rejects.toBeInstanceOf(RecipeNotAvailableError);
    expect(p().recipe.count).toHaveBeenCalledWith({ where: { id: { in: ["recipe-b"] }, tenantId: "tenant-a" } });
    expect(p().templateMealItem.deleteMany).not.toHaveBeenCalled();
    expect(p().templateMealItem.createMany).not.toHaveBeenCalled();
    expect(p().templateMealItem.create).not.toHaveBeenCalled();
    expect(p().templateMeal.update).not.toHaveBeenCalled();
  });

  it("scopes the neighboring meal read and both reorder writes to the same tenant and template", async () => {
    p().templateMeal.findFirst.mockResolvedValueOnce(meal("PER_DAY", [], { order: 1 }))
      .mockResolvedValueOnce(meal("PER_DAY", [], { id: "neighbor", order: 0 }));
    await moveMeal("template", "t1", "meal1", "up", "tenant-a");
    expect(p().templateMeal.findFirst).toHaveBeenNthCalledWith(2, {
      where: { ...tenantTemplate, order: { lt: 1 } }, orderBy: { order: "desc" },
    });
    expect(p().templateMeal.update.mock.calls).toEqual([
      [{ where: { id: "meal1", ...tenantTemplate }, data: { order: 0 } }],
      [{ where: { id: "neighbor", ...tenantTemplate }, data: { order: 1 } }],
    ]);
  });

  it.each([
    ["official", true], ["own", true], ["foreign", false], ["ownerless", false], ["unknown", false],
  ] as const)("repeats scoped food references only when visible to the tenant: %s", async (id, allowed) => {
    const foods = [
      { id: "official", source: "SARA2", tenantId: null, active: false },
      { id: "own", source: "PROPIO", tenantId: "tenant-a" },
      { id: "foreign", source: "PROPIO", tenantId: "tenant-b" },
      { id: "ownerless", source: "PROPIO", tenantId: null },
    ];
    const days = ["TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    const original = { weekday: "TUE", foodId: "original" };
    let stored = [original];
    let staged = [...stored];
    p().templateMeal.findFirst.mockResolvedValue(meal("PER_DAY", [item(id, "MON", 0, { foodId: id })]));
    // Model the nested filter and commit-on-success only; this does not exercise Prisma or PostgreSQL.
    p().$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const result = await fn(p());
      stored = staged;
      return result;
    });
    p().templateMealItem.deleteMany.mockImplementation(() => { staged = []; });
    const missing = new Error("mock nested connect found no food");
    p().templateMealItem.create.mockImplementation(({ data }: { data: {
      weekday: string;
      food: { connect: { id: string; OR?: { source: string; tenantId?: string }[] } };
    } }) => {
      const { id, OR } = data.food.connect;
      const match = foods.some((food) => food.id === id && (!OR || OR.some((filter) =>
        Object.entries(filter).every(([key, value]) => food[key as keyof typeof food] === value))));
      if (!match) throw missing;
      staged.push({ weekday: data.weekday, foodId: id });
    });

    const repeat = repeatMealInAllDays("template", "t1", "meal1", "MON", "tenant-a");
    if (allowed) {
      await expect(repeat).resolves.toMatchObject({ items: [{ weekday: "MON", foodId: id }] });
      expect(stored).toEqual(days.map((weekday) => ({ weekday, foodId: id })));
    } else {
      await expect(repeat).rejects.toBe(missing);
      expect(stored).toEqual([original]);
    }
    expect(p().templateMealItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      food: { connect: { id, OR: [{ source: "SARA2" }, { source: "PROPIO", tenantId: "tenant-a" }] } },
    }) });
  });

  it("repeats own recipe items with scoped deletion and connections", async () => {
    p().templateMeal.findFirst.mockResolvedValue(meal("PER_DAY", [tenantRecipeItem]));
    p().recipe.count.mockResolvedValue(1);
    const undo = await repeatMealInAllDays("template", "t1", "meal1", "MON", "tenant-a");
    expect(undo.items).toHaveLength(1);
    expect(p().templateMeal.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "meal1", ...tenantTemplate } }));
    expect(p().templateMealItem.deleteMany).toHaveBeenCalledWith({ where: { mealId: "meal1", meal: tenantTemplate, weekday: { in: ["TUE", "WED", "THU", "FRI", "SAT", "SUN"] } } });
    expect(p().templateMealItem.create).toHaveBeenCalledTimes(6);
    expect(p().templateMealItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      weekday: "TUE", meal: { connect: { id: "meal1", ...tenantTemplate } }, recipe: { connect: { id: "recipe-b", tenantId: "tenant-a" } },
    }) });
  });
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
        { foodId: "f-a", customLabel: null, quantityGrams: 150, notes: null, order: 0, weekday: null, recipeId: null, portions: null, measureQty: null, measureName: null, measurePlural: null, measureGrams: null },
        { foodId: "f-b", customLabel: null, quantityGrams: 150, notes: null, order: 1, weekday: null, recipeId: null, portions: null, measureQty: null, measureName: null, measurePlural: null, measureGrams: null },
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
  it("repeats a legacy plan food ID without applying a template scope", async () => {
    p().planMeal.findFirst.mockResolvedValue(meal("PER_DAY", [item("legacy", "MON")]));
    const undo = await repeatMealInAllDays("plan", "plan1", "meal1", "MON");
    expect(undo.items).toMatchObject([{ weekday: "MON", foodId: "f-legacy" }]);
    expect(createdRows(p().planMealItem)).toEqual(
      ["TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((weekday) => ({ ...undo.items[0], mealId: "meal1", weekday })),
    );
    expect(p().planMealItem.create).not.toHaveBeenCalled();
  });
  it("en una comida EVERY_DAY → MealModeError", async () => {
    p().planMeal.findFirst.mockResolvedValue(meal("EVERY_DAY", []));
    await expect(repeatMealInAllDays("plan", "plan1", "meal1", "MON")).rejects.toBeInstanceOf(MealModeError);
  });
});

describe("restoreMealSnapshots", () => {
  const snap = {
    mealId: "meal1", mode: "PER_DAY" as const, isOptions: false,
    items: [{ foodId: "f1", customLabel: null, quantityGrams: 80, notes: "n", order: 0, weekday: "MON" as const, recipeId: null, portions: null, measureQty: null, measureName: null, measurePlural: null, measureGrams: null }],
  };
  it("borra los ítems de la comida, restaura el modo y recrea los de la foto", async () => {
    p().planMeal.count.mockResolvedValue(1);
    await restoreMealSnapshots("plan", "plan1", [snap]);
    expect(p().planMeal.count).toHaveBeenCalledWith({ where: { id: { in: ["meal1"] }, planId: "plan1" } });
    expect(p().planMealItem.deleteMany).toHaveBeenCalledWith({ where: { mealId: "meal1" } });
    expect(p().planMeal.update).toHaveBeenCalledWith({ where: { id: "meal1" }, data: { mode: "PER_DAY", isOptions: false } });
    expect(createdRows(p().planMealItem)).toEqual([
      { mealId: "meal1", foodId: "f1", customLabel: null, quantityGrams: 80, notes: "n", order: 0, weekday: "MON", recipeId: null, portions: null, measureQty: null, measureName: null, measurePlural: null, measureGrams: null },
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
  it("renames a plan meal with the legacy trimmed name and plan ownership check", async () => {
    p().planMeal.findFirst.mockResolvedValue(meal("EVERY_DAY", []));
    await renameMeal("plan", "plan1", "meal1", "  Almuerzo  ");
    expect(p().planMeal.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "meal1", planId: "plan1" } }));
    expect(p().planMeal.update).toHaveBeenCalledWith({ where: { id: "meal1" }, data: { name: "Almuerzo" } });
  });
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
      id: "t1", title: "Semanal", notes: null, status: "PUBLISHED", sections: [],
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
    p().agenda = { findUnique: vi.fn().mockResolvedValue({ professional: { timezone: "America/Argentina/Buenos_Aires" } }) };
    p().patient = { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "pat1" }) };
    p().nutritionPlan.create.mockResolvedValue({ id: "plan9" });
    const plan = await createPlan("pat1", { title: "Plan de octubre" });
    expect(plan).toEqual({ id: "plan9" });
    expect(p().$transaction).toHaveBeenCalledTimes(1);
    expect(p().nutritionPlan.create).toHaveBeenCalledWith({ data: { patientId: "pat1", tenantId: "legacy-tenant", title: "Plan de octubre", status: "DRAFT" } });
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
    const tenantId = "legacy-tenant";
    mocks.prisma.agenda = { findUnique: vi.fn().mockResolvedValue({ professional: { timezone: "America/Argentina/Buenos_Aires" } }) };
    p().consultation.findUniqueOrThrow = vi.fn().mockResolvedValue({ id: "c1", patientId: "pat1", consultedAt: new Date("2026-09-12T15:00:00Z") });
    p().nutritionPlan.create.mockResolvedValue({ id: "plan10" });
    const plan = await createPlanForConsultation({ consultationId: "c1" });
    expect(plan).toEqual({ id: "plan10" });
    expect(p().nutritionPlan.create.mock.calls[0][0].data).toMatchObject({ patientId: "pat1", tenantId, title: "Plan del 12/09/2026", status: "DRAFT" });
    expect(defaultsOf(p().planMeal, "planId", "plan10")).toEqual(DEFAULTS);
    expect(p().consultation.update).toHaveBeenCalledWith({ where: { id_tenantId: { id: "c1", tenantId }, patientId: "pat1" }, data: { planId: "plan10" } });
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
      mealId: "m1", foodId: null, customLabel: null, quantityGrams: null, notes: null, order: 0, weekday: "FRI", recipeId: "rec1", portions: 1.5, measureQty: null, measureName: null, measurePlural: null, measureGrams: null,
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
      items: [{ foodId: null, customLabel: null, quantityGrams: null, notes: null, order: 0, weekday: "MON", recipeId: "rec1", portions: 0.5, measureQty: null, measureName: null, measurePlural: null, measureGrams: null }],
    }]);
    expect(createdRows(p().planMealItem)).toEqual([
      { mealId: "meal1", foodId: null, customLabel: null, quantityGrams: null, notes: null, order: 0, weekday: "MON", recipeId: "rec1", portions: 0.5, measureQty: null, measureName: null, measurePlural: null, measureGrams: null },
    ]);
  });

  it("una foto con receta y alimento, o porciones sin receta, da MealModeError sin escribir", async () => {
    const base = { foodId: null, customLabel: null, quantityGrams: null, notes: null, order: 0, weekday: "MON" as const, recipeId: "rec1", portions: 1, measureQty: null, measureName: null, measurePlural: null, measureGrams: null };
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

describe.each([
  ["plan", "planMeal", "planMealItem", { planId: "owner", plan: { tenantId: "tenant-a" } }],
  ["template", "templateMeal", "templateMealItem", { templateId: "owner", template: { tenantId: "tenant-a" } }],
] as const)("picker privado: %s", (kind, mealKey, itemKey, scope) => {
  const input = { mealId: "meal1", recipeId: "r1", weekdays: null };
  const mealWhere = { id: "meal1", ...scope };
  const recipeWhere = { id: "r1", tenantId: "tenant-a", status: "PUBLISHED" };

  it("rechaza la comida ajena antes de consultar la receta o escribir", async () => {
    p()[mealKey].findFirst.mockImplementation(({ where }: { where: object }) =>
      JSON.stringify(where) === JSON.stringify(mealWhere) ? null : meal("EVERY_DAY", []));
    await expect(addRecipeItems(kind, "owner", input, "tenant-a")).rejects.toBeInstanceOf(MealOwnershipError);
    expect(p().recipe.findUnique).not.toHaveBeenCalled();
    expect(p()[itemKey].create).not.toHaveBeenCalled();
  });

  it("rechaza una receta publicada ajena sin escribir", async () => {
    p()[mealKey].findFirst.mockResolvedValue(meal("EVERY_DAY", []));
    p().recipe.findUnique.mockImplementation(({ where }: { where: { tenantId?: string } }) =>
      where.tenantId === "tenant-a" ? null : { status: "PUBLISHED" });
    await expect(addRecipeItems(kind, "owner", input, "tenant-a")).rejects.toBeInstanceOf(RecipeNotAvailableError);
    expect(p()[itemKey].create).not.toHaveBeenCalled();
  });

  it("agrega una receta propia sujetando ambos enlaces a sus filtros al crear", async () => {
    p()[mealKey].findFirst.mockResolvedValue(meal("EVERY_DAY", []));
    p().recipe.findUnique.mockResolvedValue({ status: "PUBLISHED" });
    p()[itemKey].create.mockResolvedValue({ id: "new-item" });
    expect(await addRecipeItems(kind, "owner", input, "tenant-a")).toEqual({ itemIds: ["new-item"] });
    expect(p().recipe.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: recipeWhere }));
    expect(p()[itemKey].create).toHaveBeenCalledWith({
      data: expect.objectContaining({ meal: { connect: mealWhere }, recipe: { connect: recipeWhere }, portions: 1, order: 0, weekday: null }),
      select: { id: true },
    });
  });

  it("filtra la actualización y el borrado efectivos por dueño y tipo de ítem", async () => {
    const where = { recipeId: { not: null }, meal: scope };
    p()[itemKey].updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    await expect(setRecipeItemPortions(kind, "owner", "foreign", 1.5, "tenant-a")).rejects.toBeInstanceOf(MealOwnershipError);
    await expect(setRecipeItemPortions(kind, "owner", "own", 1.5, "tenant-a")).resolves.toBeUndefined();
    expect(p()[itemKey].updateMany.mock.calls).toEqual(["foreign", "own"].map((id) => [
      { where: { id, ...where }, data: { portions: 1.5 } },
    ]));
    expect(p()[itemKey].update).not.toHaveBeenCalled();
    p()[itemKey].deleteMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    expect(await removeMenuItems(kind, "owner", ["foreign"], "tenant-a")).toBe(0);
    expect(await removeMenuItems(kind, "owner", ["own", "foreign"], "tenant-a")).toBe(1);
    expect(p()[itemKey].deleteMany.mock.calls).toEqual([["foreign"], ["own", "foreign"]].map((ids) => [
      { where: { id: { in: ids }, ...where } },
    ]));
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

describe("HU-018d: medida casera en copias e invariantes", () => {
  const dec = (v: number) => ({ toString: () => String(v) });
  const measureItem = (id: string, weekday: string | null, order = 0) =>
    item(id, weekday, order, {
      quantityGrams: dec(270), recipeId: null, portions: null,
      measureQty: dec(1.5), measureName: "taza", measurePlural: "tazas", measureGrams: dec(180),
    });
  const MEASURE = { measureQty: 1.5, measureName: "taza", measurePlural: "tazas", measureGrams: 180, quantityGrams: 270 };

  it("copyDay copia los cuatro campos de la medida", async () => {
    p().planMeal.findMany.mockResolvedValue([meal("PER_DAY", [measureItem("a", "MON")], { id: "m1" })]);
    const snapshots = await copyDay("plan", "plan1", { from: "MON", to: ["THU"] });
    expect(createdRows(p().planMealItem)).toEqual([
      { mealId: "m1", foodId: "f-a", customLabel: null, notes: null, order: 0, weekday: "THU", recipeId: null, portions: null, ...MEASURE },
    ]);
    expect(snapshots[0]!.items[0]).toMatchObject(MEASURE);
  });

  it("repeatMealInAllDays copia la medida a los otros 6 días", async () => {
    p().planMeal.findFirst.mockResolvedValue(meal("PER_DAY", [measureItem("a", "MON")]));
    await repeatMealInAllDays("plan", "plan1", "meal1", "MON");
    const rows = createdRows(p().planMealItem);
    expect(rows).toHaveLength(6);
    expect(rows.every((r: any) => r.measureName === "taza" && r.measureQty === 1.5 && r.measureGrams === 180 && r.measurePlural === "tazas")).toBe(true);
  });

  it("setMealMode EVERY_DAY → PER_DAY copia la medida a los 7 días", async () => {
    p().templateMeal.findFirst.mockResolvedValue(meal("EVERY_DAY", [measureItem("a", null)]));
    await setMealMode("template", "t1", "meal1", { mode: "PER_DAY" });
    const rows = createdRows(p().templateMealItem);
    expect(rows).toHaveLength(7);
    expect(rows.every((r: any) => r.measureName === "taza" && r.quantityGrams === 270)).toBe(true);
  });

  const base = {
    foodId: "f1", customLabel: null, quantityGrams: 270, notes: null, order: 0, weekday: "MON" as const,
    recipeId: null, portions: null, measureQty: 1.5, measureName: "taza", measurePlural: "tazas", measureGrams: 180,
  };
  const restore = (i: typeof base | Record<string, unknown>) =>
    restoreMealSnapshots("plan", "plan1", [{ mealId: "meal1", mode: "PER_DAY", isOptions: false, items: [i as typeof base] }]);

  it("restoreMealSnapshots acepta una foto con medida válida y la recrea", async () => {
    p().planMeal.count.mockResolvedValue(1);
    await restore(base);
    expect(createdRows(p().planMealItem)).toEqual([{ mealId: "meal1", ...base }]);
  });

  it("restoreMealSnapshots rechaza medidas inválidas sin escribir", async () => {
    const bad = [
      { ...base, measurePlural: null }, // 3 de 4
      { ...base, foodId: null }, // sin alimento
      { ...base, recipeId: "rec1" }, // con receta
      { ...base, measureQty: 1.3, quantityGrams: 234 }, // cantidad fuera de la grilla
      { ...base, quantityGrams: 300 }, // gramos que no coinciden
      { ...base, customLabel: "arroz" }, // con descripción libre
      { ...base, measureGrams: 0 }, // gramos por medida fuera de rango
    ];
    for (const i of bad) await expect(restore(i)).rejects.toBeInstanceOf(MealModeError);
    expect(p().$transaction).not.toHaveBeenCalled();
  });

  it("tolera 0,01 g de diferencia por redondeo", async () => {
    p().planMeal.count.mockResolvedValue(1);
    await expect(restore({ ...base, quantityGrams: 270.01 })).resolves.toBeUndefined();
  });
});

describe("HU-018d (1b): setMeasureItemQuantity", () => {
  const dec = (v: number) => ({ toString: () => String(v) });

  it("usa los gramos COPIADOS en el ítem, filtra por medida y dueño", async () => {
    p().planMealItem.findFirst.mockResolvedValueOnce({ id: "it1", measureGrams: dec(180) });
    const out = await setMeasureItemQuantity("plan", "plan1", "it1", 2);
    expect(out).toEqual({ quantityGrams: 360 });
    expect(p().planMealItem.findFirst.mock.calls[0][0].where).toEqual({
      id: "it1", measureName: { not: null }, meal: { planId: "plan1" },
    });
    expect(p().planMealItem.update).toHaveBeenCalledWith({ where: { id: "it1" }, data: { measureQty: 2, quantityGrams: 360 } });
  });

  it("¼ de 0,1 g redondea a 2 decimales; plantilla usa templateId", async () => {
    p().templateMealItem.findFirst.mockResolvedValueOnce({ id: "it2", measureGrams: dec(0.1) });
    expect(await setMeasureItemQuantity("template", "t1", "it2", 0.25)).toEqual({ quantityGrams: 0.03 });
    expect(p().templateMealItem.findFirst.mock.calls[0][0].where.meal).toEqual({ templateId: "t1" });
  });

  it("scopes template measure reads and writes by item, template and tenant", async () => {
    const item = p().templateMealItem;
    const where = { id: "it2", measureName: { not: null }, meal: { templateId: "t1", template: { tenantId: "tenant-a" } } };
    item.findFirst.mockResolvedValueOnce(null);
    await expect(setMeasureItemQuantity("template", "t1", "it2", 0.25, "tenant-a")).rejects.toBeInstanceOf(MealOwnershipError);
    expect(item.updateMany).not.toHaveBeenCalled();
    item.findFirst.mockResolvedValue({ id: "it2", measureGrams: dec(0.1) });
    item.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(setMeasureItemQuantity("template", "t1", "it2", 0.25, "tenant-a")).resolves.toEqual({ quantityGrams: 0.03 });
    await expect(setMeasureItemQuantity("template", "t1", "it2", 0.25, "tenant-a")).rejects.toBeInstanceOf(MealOwnershipError);
    expect(item.findFirst.mock.calls).toEqual(Array.from({ length: 3 }, () => [{ where, select: { id: true, measureGrams: true } }]));
    expect(item.updateMany.mock.calls).toEqual(Array.from({ length: 2 }, () => [{ where, data: { measureQty: 0.25, quantityGrams: 0.03 } }]));
    expect(item.update).not.toHaveBeenCalled();
  });

  it("cantidad fuera de la grilla → RangeError sin tocar la base", async () => {
    for (const bad of [0, 1.3, 20.25, Number.NaN]) {
      await expect(setMeasureItemQuantity("plan", "plan1", "it1", bad)).rejects.toBeInstanceOf(RangeError);
    }
    expect(p().planMealItem.findFirst).not.toHaveBeenCalled();
    expect(p().planMealItem.update).not.toHaveBeenCalled();
  });

  it("ítem sin medida o de otro dueño → MealOwnershipError", async () => {
    p().planMealItem.findFirst.mockResolvedValueOnce(null);
    await expect(setMeasureItemQuantity("plan", "otro", "it1", 1)).rejects.toBeInstanceOf(MealOwnershipError);
    expect(p().planMealItem.update).not.toHaveBeenCalled();
  });
});
