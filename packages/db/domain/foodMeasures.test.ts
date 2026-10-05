// HU-018d: CRUD de medidas caseras y resolveMeasureItem (prisma mockeado, patrón de weeklyMenu.test.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ prisma: {} as Record<string, any> }));
vi.mock("../index", () => ({ prisma: mocks.prisma }));

import {
  DuplicateFoodMeasureError,
  FoodMeasureNotFoundError,
  InvalidFoodMeasureError,
  createFoodMeasure,
  deleteFoodMeasure,
  listFoodMeasures,
  listMeasuresForPicker,
  moveFoodMeasure,
  resolveMeasureItem,
  updateFoodMeasure,
} from "./foodMeasures";

const p = () => mocks.prisma;
const dec = (v: number) => ({ toString: () => String(v) });
const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id, foodId: "food1", name: "taza", plural: null, grams: dec(180), order: 0, ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.food = { findUnique: vi.fn() };
  mocks.prisma.foodMeasure = {
    findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(),
    delete: vi.fn(), aggregate: vi.fn(),
  };
  mocks.prisma.planMealItem = { update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() };
  mocks.prisma.templateMealItem = { update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() };
  mocks.prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
});

describe("createFoodMeasure", () => {
  it("con datos inválidos no toca la base", async () => {
    await expect(createFoodMeasure("food1", { name: "", plural: null, grams: 0 })).rejects.toBeInstanceOf(InvalidFoodMeasureError);
    const err = await createFoodMeasure("food1", { name: "", plural: null, grams: 0 }).catch((e) => e);
    expect(err.issues.map((i: any) => i.field)).toEqual(["name", "grams"]);
    expect(p().$transaction).not.toHaveBeenCalled();
  });

  it("normaliza y crea al final (order = máx + 1)", async () => {
    p().food.findUnique.mockResolvedValue({ id: "food1" });
    p().foodMeasure.findFirst.mockResolvedValue(null);
    p().foodMeasure.aggregate.mockResolvedValue({ _max: { order: 2 } });
    p().foodMeasure.create.mockResolvedValue(row("m1", { name: "unidad mediana", grams: dec(120), order: 3 }));
    const created = await createFoodMeasure("food1", { name: "  unidad   mediana ", plural: "unidades medianas", grams: 120.04 });
    expect(p().foodMeasure.findFirst.mock.calls[0][0].where).toEqual({ foodId: "food1", nameKey: "unidad mediana" });
    expect(p().foodMeasure.create.mock.calls[0][0].data).toEqual({
      foodId: "food1", name: "unidad mediana", nameKey: "unidad mediana", plural: null, grams: 120, order: 3,
    });
    expect(created).toEqual({ id: "m1", foodId: "food1", name: "unidad mediana", plural: null, grams: 120, order: 3 });
  });

  it("sin medidas previas arranca en order 0", async () => {
    p().food.findUnique.mockResolvedValue({ id: "food1" });
    p().foodMeasure.findFirst.mockResolvedValue(null);
    p().foodMeasure.aggregate.mockResolvedValue({ _max: { order: null } });
    p().foodMeasure.create.mockResolvedValue(row("m1"));
    await createFoodMeasure("food1", { name: "taza", plural: null, grams: 180 });
    expect(p().foodMeasure.create.mock.calls[0][0].data.order).toBe(0);
  });

  it("duplicado por nameKey → DuplicateFoodMeasureError con el nombre guardado", async () => {
    p().food.findUnique.mockResolvedValue({ id: "food1" });
    p().foodMeasure.findFirst.mockResolvedValue({ name: "taza" });
    const err = await createFoodMeasure("food1", { name: "Tazá", plural: null, grams: 160 }).catch((e) => e);
    expect(err).toBeInstanceOf(DuplicateFoodMeasureError);
    expect(err.existingName).toBe("taza");
    expect(p().foodMeasure.findFirst.mock.calls[0][0].where.nameKey).toBe("taza");
    expect(p().foodMeasure.create).not.toHaveBeenCalled();
  });

  it("el P2002 de la base se traduce al mismo error", async () => {
    p().food.findUnique.mockResolvedValue({ id: "food1" });
    p().foodMeasure.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ name: "Taza" });
    p().foodMeasure.aggregate.mockResolvedValue({ _max: { order: 0 } });
    p().foodMeasure.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const err = await createFoodMeasure("food1", { name: "taza", plural: null, grams: 180 }).catch((e) => e);
    expect(err).toBeInstanceOf(DuplicateFoodMeasureError);
    expect(err.existingName).toBe("Taza");
  });

  it("alimento inexistente → FoodMeasureNotFoundError", async () => {
    p().food.findUnique.mockResolvedValue(null);
    await expect(createFoodMeasure("nope", { name: "taza", plural: null, grams: 180 })).rejects.toBeInstanceOf(FoodMeasureNotFoundError);
  });
});

describe("updateFoodMeasure", () => {
  it("se excluye a sí misma de la unicidad y no toca ítems", async () => {
    p().foodMeasure.findUnique.mockResolvedValue({ foodId: "food1" });
    p().foodMeasure.findFirst.mockResolvedValue(null);
    p().foodMeasure.update.mockResolvedValue(row("m1", { grams: dec(160) }));
    const updated = await updateFoodMeasure("m1", { name: "taza", plural: null, grams: 160 });
    expect(p().foodMeasure.findFirst.mock.calls[0][0].where).toEqual({ foodId: "food1", nameKey: "taza", NOT: { id: "m1" } });
    expect(p().foodMeasure.update.mock.calls[0][0].data).toEqual({ name: "taza", nameKey: "taza", plural: null, grams: 160 });
    expect(updated.grams).toBe(160);
    expect(p().planMealItem.update).not.toHaveBeenCalled();
    expect(p().planMealItem.updateMany).not.toHaveBeenCalled();
    expect(p().templateMealItem.updateMany).not.toHaveBeenCalled();
  });

  it("inexistente → not found; duplicada con otra → DuplicateFoodMeasureError", async () => {
    p().foodMeasure.findUnique.mockResolvedValueOnce(null);
    await expect(updateFoodMeasure("x", { name: "taza", plural: null, grams: 1 })).rejects.toBeInstanceOf(FoodMeasureNotFoundError);
    p().foodMeasure.findUnique.mockResolvedValueOnce({ foodId: "food1" });
    p().foodMeasure.findFirst.mockResolvedValueOnce({ name: "cda" });
    await expect(updateFoodMeasure("m1", { name: "CDA", plural: null, grams: 1 })).rejects.toBeInstanceOf(DuplicateFoodMeasureError);
  });
});

describe("deleteFoodMeasure / moveFoodMeasure", () => {
  it("borra solo esa medida, no toca ítems y devuelve el foodId", async () => {
    p().foodMeasure.findUnique.mockResolvedValue({ foodId: "food1" });
    expect(await deleteFoodMeasure("m1")).toEqual({ foodId: "food1" });
    expect(p().foodMeasure.delete).toHaveBeenCalledWith({ where: { id: "m1" } });
    expect(p().planMealItem.deleteMany).not.toHaveBeenCalled();
    expect(p().templateMealItem.deleteMany).not.toHaveBeenCalled();
  });

  it("deleteFoodMeasure inexistente → not found", async () => {
    p().foodMeasure.findUnique.mockResolvedValue(null);
    await expect(deleteFoodMeasure("x")).rejects.toBeInstanceOf(FoodMeasureNotFoundError);
  });

  it("moveFoodMeasure intercambia el order con la vecina", async () => {
    p().foodMeasure.findUnique.mockResolvedValue({ foodId: "food1" });
    p().foodMeasure.findMany.mockResolvedValue([{ id: "a", order: 0 }, { id: "b", order: 1 }, { id: "c", order: 2 }]);
    expect(await moveFoodMeasure("b", "up")).toEqual({ foodId: "food1" });
    expect(p().foodMeasure.update.mock.calls.map((c: any) => c[0])).toEqual([
      { where: { id: "b" }, data: { order: 0 } },
      { where: { id: "a" }, data: { order: 1 } },
    ]);
  });

  it("en el borde no escribe", async () => {
    p().foodMeasure.findUnique.mockResolvedValue({ foodId: "food1" });
    p().foodMeasure.findMany.mockResolvedValue([{ id: "a", order: 0 }, { id: "b", order: 1 }]);
    await moveFoodMeasure("a", "up");
    await moveFoodMeasure("b", "down");
    expect(p().foodMeasure.update).not.toHaveBeenCalled();
  });
});

describe("listados", () => {
  it("listFoodMeasures ordena por order y pasa grams a number", async () => {
    p().foodMeasure.findMany.mockResolvedValue([row("a"), row("b", { name: "cda", grams: dec(15), order: 1 })]);
    const list = await listFoodMeasures("food1");
    expect(p().foodMeasure.findMany.mock.calls[0][0].where).toEqual({ foodId: "food1" });
    expect(p().foodMeasure.findMany.mock.calls[0][0].orderBy[0]).toEqual({ order: "asc" });
    expect(list.map((m) => [m.name, m.grams])).toEqual([["taza", 180], ["cda", 15]]);
  });

  it("listMeasuresForPicker filtra SARA 2 activos y agrupa en orden", async () => {
    p().foodMeasure.findMany.mockResolvedValue([
      row("a", { foodId: "f1", order: 0 }),
      row("b", { foodId: "f1", name: "cda", order: 1 }),
      row("c", { foodId: "f2", name: "vaso", order: 0 }),
    ]);
    const grouped = await listMeasuresForPicker();
    expect(p().foodMeasure.findMany.mock.calls[0][0].where).toEqual({ food: { source: "SARA2", active: true } });
    expect(Object.keys(grouped)).toEqual(["f1", "f2"]);
    expect(grouped.f1!.map((m) => m.id)).toEqual(["a", "b"]);
    expect(grouped.f2!.map((m) => m.name)).toEqual(["vaso"]);
  });
});

describe("resolveMeasureItem", () => {
  it("arma la copia con plural resuelto y gramos", async () => {
    p().foodMeasure.findUnique.mockResolvedValue(row("m1"));
    expect(await resolveMeasureItem("food1", "m1", 1.5)).toEqual({
      measureQty: 1.5, measureName: "taza", measurePlural: "tazas", measureGrams: 180, quantityGrams: 270,
    });
  });

  it("usa el plural escrito a mano si lo hay", async () => {
    p().foodMeasure.findUnique.mockResolvedValue(row("m1", { name: "pan", plural: "panes chicos", grams: dec(30) }));
    expect((await resolveMeasureItem("food1", "m1", 2)).measurePlural).toBe("panes chicos");
  });

  it("medida de otro alimento o inexistente → not found; qty fuera de la grilla → RangeError", async () => {
    p().foodMeasure.findUnique.mockResolvedValueOnce(row("m1", { foodId: "otro" }));
    await expect(resolveMeasureItem("food1", "m1", 1)).rejects.toBeInstanceOf(FoodMeasureNotFoundError);
    p().foodMeasure.findUnique.mockResolvedValueOnce(null);
    await expect(resolveMeasureItem("food1", "m1", 1)).rejects.toBeInstanceOf(FoodMeasureNotFoundError);
    p().foodMeasure.findUnique.mockResolvedValueOnce(row("m1"));
    await expect(resolveMeasureItem("food1", "m1", 1.3)).rejects.toBeInstanceOf(RangeError);
  });
});
