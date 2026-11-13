// HU-018d (1b): conversión de unitHint en medidas (prisma mockeado, sin base).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ prisma: {} as Record<string, any> }));
vi.mock("../index", () => ({ prisma: mocks.prisma }));

import { convertUnitHints } from "./unitHintConversion";

const p = () => mocks.prisma;
const food = (id: string, unitHint: string | null, measures: { name: string; nameKey: string; order: number }[] = []) => ({
  id, name: `Alimento ${id}`, source: "PROPIO", unitHint, measures,
});

const FOODS = [
  food("a", "1 taza ≈ 180 g"),
  food("b", "4 unidades ≈ 25 g", [{ name: "Unidad", nameKey: "unidad", order: 0 }]),
  food("c", "porción chica"),
  food("d", "1/2 taza ≈ 125 g", [{ name: "cda", nameKey: "cda", order: 0 }, { name: "pote", nameKey: "pote", order: 3 }]),
  food("e", "   "),
  food("f", "1 vaso ≈ 200 ml"),
];

beforeEach(() => {
  vi.resetAllMocks();
  p().food = { findMany: vi.fn().mockResolvedValue(FOODS) };
  p().foodMeasure = { create: vi.fn() };
  p().$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(mocks.prisma));
});

describe("convertUnitHints", () => {
  it("en seco: reporta sin escribir y sin transacción", async () => {
    const rows = await convertUnitHints({ apply: false });
    expect(p().$transaction).not.toHaveBeenCalled();
    expect(p().foodMeasure.create).not.toHaveBeenCalled();
    expect(rows.map((r) => [r.foodId, r.result])).toEqual([
      ["a", { kind: "WOULD_CREATE", name: "taza", grams: 180 }],
      ["b", { kind: "ALREADY_HAD", name: "Unidad" }],
      ["c", { kind: "UNREADABLE" }],
      ["d", { kind: "WOULD_CREATE", name: "taza", grams: 250 }],
      ["f", { kind: "WOULD_CREATE", name: "vaso", grams: 200 }],
    ]);
    // unitHint vacío ("   ") no aparece; el texto va limpio.
    expect(rows.find((r) => r.foodId === "e")).toBeUndefined();
    expect(p().food.findMany.mock.calls[0][0].where).toEqual({ unitHint: { not: null } });
  });

  it("apply: una transacción, crea solo los que faltan, al final de la lista", async () => {
    const rows = await convertUnitHints({ apply: true });
    expect(p().$transaction).toHaveBeenCalledTimes(1);
    const created = p().foodMeasure.create.mock.calls.map((c: any[]) => c[0].data);
    expect(created).toEqual([
      { foodId: "a", name: "taza", nameKey: "taza", plural: null, grams: 180, order: 0 },
      { foodId: "d", name: "taza", nameKey: "taza", plural: null, grams: 250, order: 4 },
      { foodId: "f", name: "vaso", nameKey: "vaso", plural: null, grams: 200, order: 0 },
    ]);
    expect(rows.filter((r) => r.result.kind === "CREATED")).toHaveLength(3);
    expect(rows.some((r) => r.result.kind === "WOULD_CREATE")).toBe(false);
  });

  it("idempotente: si ya tienen la medida (por nameKey, sin tildes ni mayúsculas), no crea nada", async () => {
    p().food.findMany.mockResolvedValue([food("a", "1 taza ≈ 180 g", [{ name: "Tazá", nameKey: "taza", order: 0 }])]);
    const rows = await convertUnitHints({ apply: true });
    expect(rows[0]!.result).toEqual({ kind: "ALREADY_HAD", name: "Tazá" });
    expect(p().foodMeasure.create).not.toHaveBeenCalled();
  });

  it("foodIds limita la consulta; nunca actualiza Food (unitHint queda)", async () => {
    p().food.update = vi.fn();
    p().food.updateMany = vi.fn();
    await convertUnitHints({ apply: true, foodIds: ["a", "c"] });
    expect(p().food.findMany.mock.calls[0][0].where).toEqual({ unitHint: { not: null }, id: { in: ["a", "c"] } });
    expect(p().food.update).not.toHaveBeenCalled();
    expect(p().food.updateMany).not.toHaveBeenCalled();
  });
});
