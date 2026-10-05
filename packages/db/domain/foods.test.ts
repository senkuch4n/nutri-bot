// HU-018d (D9, SDD 5.2): el unitHint deja de viajar desde el formulario de propios. Guardar sin la
// clave no puede borrar el que ya estaba. Prisma mockeado.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ prisma: {} as Record<string, any> }));
vi.mock("../index", () => ({ prisma: mocks.prisma }));

import { createOwnFood, updateOwnFood, type OwnFoodInput } from "./foods";

const input: OwnFoodInput = {
  name: "Yogur casero", group: "YOGURES", reference: null,
  proteinPer100: 3.5, carbsPer100: 4.7, fatPer100: 3.2, fiberPer100: null, alcoholPer100: null,
  sodiumMgPer100: null, addedSugarPer100: null, saturatedFatPer100: null, cholesterolMgPer100: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.food = {
    findUniqueOrThrow: vi.fn().mockResolvedValue({ source: "PROPIO" }),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({ id: "f1" }),
    create: vi.fn().mockResolvedValue({ id: "f2" }),
  };
});

describe("updateOwnFood y unitHint (HU-018d)", () => {
  it("sin unitHint, el data del update no tiene la clave (no borra el guardado)", async () => {
    await updateOwnFood("f1", input);
    const data = mocks.prisma.food.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("unitHint");
    expect(data.name).toBe("Yogur casero");
    expect(data.kcalPer100).toBeGreaterThan(0);
  });

  it("con unitHint explícito lo sigue escribiendo (limpio, vacío → null)", async () => {
    await updateOwnFood("f1", { ...input, unitHint: "  1 pote ≈ 190 g " });
    expect(mocks.prisma.food.update.mock.calls[0][0].data.unitHint).toBe("1 pote ≈ 190 g");
    await updateOwnFood("f1", { ...input, unitHint: "  " });
    expect(mocks.prisma.food.update.mock.calls[1][0].data.unitHint).toBeNull();
    await updateOwnFood("f1", { ...input, unitHint: null });
    expect(mocks.prisma.food.update.mock.calls[2][0].data.unitHint).toBeNull();
  });

  it("createOwnFood sin unitHint tampoco manda la clave", async () => {
    await createOwnFood(input);
    expect(mocks.prisma.food.create.mock.calls[0][0].data).not.toHaveProperty("unitHint");
  });
});
