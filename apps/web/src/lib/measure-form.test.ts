import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class FoodMeasureNotFoundError extends Error {}
  return { FoodMeasureNotFoundError, resolveMeasureItem: vi.fn() };
});

vi.mock("server-only", () => ({}));
vi.mock("@nutri-bot/db/domain", () => mocks);

import { readMeasureFields, resolveFormMeasure } from "./measure-form";

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

describe("readMeasureFields (HU-018d)", () => {
  it("sin measureId → null (ítem en gramos)", () => {
    expect(readMeasureFields(form({ quantityGrams: "120" }), "f1")).toBeNull();
    expect(readMeasureFields(form({ measureId: "  " }), "f1")).toBeNull();
  });
  it("con measureId y sin foodId → invalid", () => {
    expect(readMeasureFields(form({ measureId: "m1", measureQty: "1" }), "")).toBe("invalid");
  });
  it("lee la cantidad con coma o punto", () => {
    expect(readMeasureFields(form({ measureId: "m1", measureQty: "1,5" }), "f1")).toEqual({ measureId: "m1", qty: 1.5 });
    expect(readMeasureFields(form({ measureId: "m1", measureQty: "0.25" }), "f1")).toEqual({ measureId: "m1", qty: 0.25 });
  });
  it("cantidad fuera de la grilla, vacía o no numérica → invalid", () => {
    for (const q of ["1,3", "0", "20,25", "", "abc", "-1"]) {
      expect(readMeasureFields(form({ measureId: "m1", measureQty: q }), "f1"), q).toBe("invalid");
    }
  });
});

describe("resolveFormMeasure (018d-1b, R4)", () => {
  const fields = { foodId: "f1", measureQty: 1.5, measureName: "taza", measurePlural: "tazas", measureGrams: 180, quantityGrams: 270 };

  it("ok → los campos de la medida", async () => {
    mocks.resolveMeasureItem.mockResolvedValueOnce(fields);
    expect(await resolveFormMeasure("f1", { measureId: "m1", qty: 1.5 })).toEqual(fields);
    expect(mocks.resolveMeasureItem).toHaveBeenCalledWith("f1", "m1", 1.5);
  });

  it("medida borrada (not found) o cantidad inválida (RangeError) → gone", async () => {
    mocks.resolveMeasureItem.mockRejectedValueOnce(new mocks.FoodMeasureNotFoundError());
    expect(await resolveFormMeasure("f1", { measureId: "m1", qty: 1 })).toBe("gone");
    mocks.resolveMeasureItem.mockRejectedValueOnce(new RangeError("qty"));
    expect(await resolveFormMeasure("f1", { measureId: "m1", qty: 1 })).toBe("gone");
  });

  it("cualquier otro error sigue de largo", async () => {
    mocks.resolveMeasureItem.mockRejectedValueOnce(new Error("db caída"));
    await expect(resolveFormMeasure("f1", { measureId: "m1", qty: 1 })).rejects.toThrow("db caída");
  });
});
