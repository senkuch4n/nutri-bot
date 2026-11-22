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
    setMeasureItemQuantity: vi.fn(),
    revalidateMenuOwner: vi.fn(),
    ctx: vi.fn(),
    touchTemplate: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

// HU-025: el consultorio sale del contexto de la sesión (requireTenantContext mockeado directo).
const TENANT_CTX = vi.hoisted(() => ({
  userId: "u", tenantId: "legacy-tenant", agendaId: "legacy-agenda", professionalId: 1,
  access: { kind: "member" as const, tenantId: "legacy-tenant", role: "OWNER" as const },
}));
vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: mocks.ctx,
  TenantAccessError: class TenantAccessError extends Error {},
}));
vi.mock("@nutri-bot/db/domain", () => ({
  InvalidFoodMeasureError: mocks.InvalidFoodMeasureError,
  DuplicateFoodMeasureError: mocks.DuplicateFoodMeasureError,
  FoodMeasureNotFoundError: mocks.FoodMeasureNotFoundError,
  createFoodMeasure: mocks.createFoodMeasure,
  updateFoodMeasure: mocks.updateFoodMeasure,
  deleteFoodMeasure: mocks.deleteFoodMeasure,
  moveFoodMeasure: mocks.moveFoodMeasure,
  setMeasureItemQuantity: mocks.setMeasureItemQuantity,
}));
vi.mock("@/lib/revalidate-menu-owner", () => ({ revalidateMenuOwner: mocks.revalidateMenuOwner }));
vi.mock("@/lib/touch-template", () => ({ touchTemplate: mocks.touchTemplate }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import * as actions from "./food-measure-actions";
import {
  createFoodMeasureAction,
  deleteFoodMeasureAction,
  moveFoodMeasureAction,
  setMeasureItemQtyAction,
  updateFoodMeasureAction,
} from "./food-measure-actions";

const row = { id: "m1", foodId: "food1", name: "taza", plural: null, grams: 180, order: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.ctx.mockResolvedValue(TENANT_CTX);
});

describe("food-measure-actions", () => {
  it("solo exporta funciones async (Turbopack)", () => {
    for (const [name, value] of Object.entries(actions)) {
      expect(typeof value, name).toBe("function");
      expect((value as () => unknown).constructor.name, name).toBe("AsyncFunction");
    }
  });

  it("sin sesión → sessionExpired y no llama al dominio", async () => {
    mocks.ctx.mockRejectedValue(new Error("tenant_access:no_context"));
    const expected = { ok: false, error: "Tu sesión venció. Volvé a entrar." };
    expect(await createFoodMeasureAction({ foodId: "food1", name: "taza", plural: null, grams: 180 })).toEqual(expected);
    expect(await deleteFoodMeasureAction({ measureId: "m1" })).toEqual(expected);
    expect(mocks.createFoodMeasure).not.toHaveBeenCalled();
    expect(mocks.deleteFoodMeasure).not.toHaveBeenCalled();
  });

  it("create ok devuelve la medida y revalida la ficha del alimento", async () => {
    mocks.createFoodMeasure.mockResolvedValue(row);
    expect(await createFoodMeasureAction({ foodId: "food1", name: "taza", plural: null, grams: 180 })).toEqual({ ok: true, measure: row });
    expect(mocks.ctx).toHaveBeenCalledWith("write");
    expect(mocks.createFoodMeasure).toHaveBeenCalledWith(TENANT_CTX, "food1", { name: "taza", plural: null, grams: 180 });
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
    expect(mocks.moveFoodMeasure).toHaveBeenCalledWith(TENANT_CTX, "m1", "down");
    expect(mocks.deleteFoodMeasure).toHaveBeenCalledWith(TENANT_CTX, "m1");
    expect(mocks.revalidatePath.mock.calls).toEqual([["/alimentos/food1"], ["/alimentos/food1"]]);
  });

  it("stepper: ok cambia la cantidad y revalida el dueño (no la ficha)", async () => {
    mocks.setMeasureItemQuantity.mockResolvedValue({ quantityGrams: 360 });
    expect(await setMeasureItemQtyAction({ kind: "plan", ownerId: "plan1", itemId: "it1", qty: 2 })).toEqual({ ok: true });
    expect(mocks.setMeasureItemQuantity).toHaveBeenCalledWith("plan", "plan1", "it1", 2, "legacy-tenant");
    expect(mocks.revalidateMenuOwner).toHaveBeenCalledWith("plan", "plan1", "legacy-tenant");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("stepper: qty inválida, kind inválido o sin sesión no llaman al dominio", async () => {
    const qtyError = { ok: false, error: "No se pudo cambiar la cantidad. Probá de nuevo." };
    for (const qty of [0, 1.3, 20.25, Number.NaN]) {
      expect(await setMeasureItemQtyAction({ kind: "plan", ownerId: "plan1", itemId: "it1", qty })).toEqual(qtyError);
    }
    expect(await setMeasureItemQtyAction({ kind: "otro" as never, ownerId: "plan1", itemId: "it1", qty: 1 })).toEqual(qtyError);
    mocks.ctx.mockRejectedValue(new Error("tenant_access:no_context"));
    expect(await setMeasureItemQtyAction({ kind: "template", ownerId: "t1", itemId: "it1", qty: 1 })).toEqual({
      ok: false, error: "Tu sesión venció. Volvé a entrar.",
    });
    expect(mocks.setMeasureItemQuantity).not.toHaveBeenCalled();
    expect(mocks.revalidateMenuOwner).not.toHaveBeenCalled();
  });

  it("stepper: plantilla requiere pertenencia y descarta tenant del cliente", async () => {
    const input = { kind: "template" as const, ownerId: "t1", itemId: "it1", qty: 1.5, tenantId: "forged" };
    mocks.setMeasureItemQuantity.mockResolvedValue({ quantityGrams: 270 });
    mocks.ctx.mockRejectedValueOnce(new Error("tenant_access:no_context"));
    mocks.ctx.mockResolvedValueOnce({ ...TENANT_CTX, tenantId: "tenant-a" });
    expect(await setMeasureItemQtyAction(input)).toEqual({ ok: false, error: "Tu sesión venció. Volvé a entrar." });
    expect(mocks.setMeasureItemQuantity).not.toHaveBeenCalled();
    expect(mocks.touchTemplate).not.toHaveBeenCalled();
    expect(await setMeasureItemQtyAction(input)).toEqual({ ok: true });
    expect(mocks.setMeasureItemQuantity.mock.calls).toEqual([["template", "t1", "it1", 1.5, "tenant-a"]]);
    expect(mocks.touchTemplate.mock.calls).toEqual([["t1", "tenant-a"]]);
    expect(mocks.revalidateMenuOwner).not.toHaveBeenCalled();
  });

  it("stepper: error del dominio → qtyError, sin revalidar", async () => {
    mocks.setMeasureItemQuantity.mockRejectedValue(new Error("MealOwnershipError"));
    expect(await setMeasureItemQtyAction({ kind: "template", ownerId: "t1", itemId: "it1", qty: 1.5 })).toEqual({
      ok: false, error: "No se pudo cambiar la cantidad. Probá de nuevo.",
    });
    expect(mocks.revalidateMenuOwner).not.toHaveBeenCalled();
  });
});
