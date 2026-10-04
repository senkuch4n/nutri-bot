import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readMeasureFields } from "./measure-form";

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
