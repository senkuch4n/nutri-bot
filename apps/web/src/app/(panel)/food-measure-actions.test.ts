// HU-018d: actions de las medidas caseras (domain y sesión mockeados, sin base).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class InvalidFoodMeasureError extends Error {
    constructor(public readonly issues: { field: string; message: string }[]) {
      super("inválida");
    }
  }
  class DuplicateFoodMeasureError extends Error {
    constructor(public readonly existingName: string) {
      super("duplicada");
    }
  }
  class FoodMeasureNotFoundError extends Error {}
  return {
    InvalidFoodMeasureError,
    DuplicateFoodMeasureError,
    FoodMeasureNotFoundError,
    createFoodMeasure: vi.fn(),
    updateFoodMeasure: vi.fn(),
    deleteFoodMeasure: vi.fn(),
    moveFoodMeasure: vi.fn(),
    hasPanelSession: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock("@nutri-bot/db/domain", () => ({
  InvalidFoodMeasureError: mocks.InvalidFoodMeasureError,
  DuplicateFoodMeasureError: mocks.DuplicateFoodMeasureError,
  FoodMeasureNotFoundError: mocks.FoodMeasureNotFoundError,
  createFoodMeasure: mocks.createFoodMeasure,
  updateFoodMeasure: mocks.updateFoodMeasure,
  deleteFoodMeasure: mocks.deleteFoodMeasure,
  moveFoodMeasure: mocks.moveFoodMeasure,
}));
vi.mock("./recetas/recipe-save", () => ({ hasPanelSession: mocks.hasPanelSession }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import * as actions from "./food-measure-actions";
import {
  createFoodMeasureAction,
  deleteFoodMeasureAction,
  moveFoodMeasureAction,
  updateFoodMeasureAction,
} from "./food-measure-actions";

const row = { id: "m1", foodId: "food1", name: "taza", plural: null, grams: 180, order: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.hasPanelSession.mockResolvedValue(true);
});

describe("food-measure-actions", () => {
  it("solo exporta funciones async (Turbopack)", () => {
    for (const [name, value] of Object.entries(actions)) {
      expect(typeof value, name).toBe("function");
      expect((value as () => unknown).constructor.name, name).toBe("AsyncFunction");
    }
  });

  it("sin sesión → sessionExpired y no llama al dominio", async () => {
    mocks.hasPanelSession.mockResolvedValue(false);
    const expected = { ok: false, error: "Tu sesión venció. Volvé a entrar." };
    expect(await createFoodMeasureAction({ foodId: "food1", name: "taza", plural: null, grams: 180 })).toEqual(expected);
    expect(await deleteFoodMeasureAction({ measureId: "m1" })).toEqual(expected);
    expect(mocks.createFoodMeasure).not.toHaveBeenCalled();
    expect(mocks.deleteFoodMeasure).not.toHaveBeenCalled();
  });

  it("create ok devuelve la medida y revalida la ficha del alimento", async () => {
    mocks.createFoodMeasure.mockResolvedValue(row);
    expect(await createFoodMeasureAction({ foodId: "food1", name: "taza", plural: null, grams: 180 })).toEqual({ ok: true, measure: row });
    expect(mocks.createFoodMeasure).toHaveBeenCalledWith("food1", { name: "taza", plural: null, grams: 180 });
    expect(mocks.revalidatePath.mock.calls).toEqual([["/alimentos/food1"]]);
  });

  it("datos inválidos → fieldErrors por campo", async () => {
    mocks.createFoodMeasure.mockRejectedValue(new mocks.InvalidFoodMeasureError([
      { field: "name", message: "Escribí el nombre de la medida (por ejemplo, taza)" },
      { field: "grams", message: "Escribí cuántos gramos pesa una (entre 0,1 y 2000)" },
    ]));
    expect(await createFoodMeasureAction({ foodId: "food1", name: "", plural: null, grams: 0 })).toEqual({
      ok: false,
      fieldErrors: {
        name: "Escribí el nombre de la medida (por ejemplo, taza)",
        grams: "Escribí cuántos gramos pesa una (entre 0,1 y 2000)",
      },
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("duplicado → mensaje con el nombre guardado en el campo nombre", async () => {
    mocks.updateFoodMeasure.mockRejectedValue(new mocks.DuplicateFoodMeasureError("taza"));
    expect(await updateFoodMeasureAction({ measureId: "m2", name: "Taza", plural: null, grams: 160 })).toEqual({
      ok: false,
      fieldErrors: { name: "Este alimento ya tiene la medida «taza»" },
    });
  });

  it("not found y error genérico", async () => {
    mocks.updateFoodMeasure.mockRejectedValueOnce(new mocks.FoodMeasureNotFoundError());
    expect(await updateFoodMeasureAction({ measureId: "x", name: "taza", plural: null, grams: 1 })).toEqual({
      ok: false, error: "Esa medida ya no existe. Recargá la página.",
    });
    mocks.updateFoodMeasure.mockRejectedValueOnce(new Error("boom"));
    expect(await updateFoodMeasureAction({ measureId: "x", name: "taza", plural: null, grams: 1 })).toEqual({
      ok: false, error: "No se pudo guardar la medida. Probá de nuevo.",
    });
    mocks.moveFoodMeasure.mockRejectedValueOnce(new mocks.FoodMeasureNotFoundError());
    expect(await moveFoodMeasureAction({ measureId: "x", direction: "up" })).toEqual({
      ok: false, error: "Esa medida ya no existe. Recargá la página.",
    });
  });

  it("zod rechaza entradas mal formadas sin llamar al dominio", async () => {
    expect((await createFoodMeasureAction({ foodId: "", name: "taza", plural: null, grams: 1 })).ok).toBe(false);
    expect((await createFoodMeasureAction({ foodId: "f", name: "x".repeat(201), plural: null, grams: 1 })).ok).toBe(false);
    expect((await createFoodMeasureAction({ foodId: "f", name: "taza", plural: null, grams: Number.NaN })).ok).toBe(false);
    expect((await moveFoodMeasureAction({ measureId: "m1", direction: "left" as never })).ok).toBe(false);
    expect(mocks.createFoodMeasure).not.toHaveBeenCalled();
    expect(mocks.moveFoodMeasure).not.toHaveBeenCalled();
  });

  it("delete y move revalidan la ficha del alimento", async () => {
    mocks.deleteFoodMeasure.mockResolvedValue({ foodId: "food1" });
    mocks.moveFoodMeasure.mockResolvedValue({ foodId: "food1" });
    expect(await deleteFoodMeasureAction({ measureId: "m1" })).toEqual({ ok: true });
    expect(await moveFoodMeasureAction({ measureId: "m1", direction: "down" })).toEqual({ ok: true });
    expect(mocks.moveFoodMeasure).toHaveBeenCalledWith("m1", "down");
    expect(mocks.revalidatePath.mock.calls).toEqual([["/alimentos/food1"], ["/alimentos/food1"]]);
  });
});
