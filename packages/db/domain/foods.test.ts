// HU-018d (D9, SDD 5.2): el unitHint deja de viajar desde el formulario de propios. Guardar sin la
// clave no puede borrar el que ya estaba. Prisma mockeado.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ prisma: {} as Record<string, any> }));
vi.mock("../index", () => ({ prisma: mocks.prisma }));

const T = { tenantId: "legacy-tenant" };
import { FoodNotFoundError, applyAtwaterKcal, createOwnFood, findFoodNameConflicts, getFood, listFoods, setFoodActive, updateOwnFood, type OwnFoodInput } from "./foods";

const input: OwnFoodInput = {
  name: "Yogur casero", group: "YOGURES", reference: null,
  proteinPer100: 3.5, carbsPer100: 4.7, fatPer100: 3.2, fiberPer100: null, alcoholPer100: null,
  sodiumMgPer100: null, addedSugarPer100: null, saturatedFatPer100: null, cholesterolMgPer100: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.food = {
    findFirst: vi.fn().mockResolvedValue({ source: "PROPIO" }),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({ id: "f1" }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    create: vi.fn().mockResolvedValue({ id: "f2" }),
  };
});

describe("updateOwnFood y unitHint (HU-018d)", () => {
  it("sin unitHint, el data del update no tiene la clave (no borra el guardado)", async () => {
    await updateOwnFood(T, "f1", input);
    const data = mocks.prisma.food.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("unitHint");
    expect(data.name).toBe("Yogur casero");
    expect(data.kcalPer100).toBeGreaterThan(0);
  });

  it("con unitHint explícito lo sigue escribiendo (limpio, vacío → null)", async () => {
    await updateOwnFood(T, "f1", { ...input, unitHint: "  1 pote ≈ 190 g " });
    expect(mocks.prisma.food.update.mock.calls[0][0].data.unitHint).toBe("1 pote ≈ 190 g");
    await updateOwnFood(T, "f1", { ...input, unitHint: "  " });
    expect(mocks.prisma.food.update.mock.calls[1][0].data.unitHint).toBeNull();
    await updateOwnFood(T, "f1", { ...input, unitHint: null });
    expect(mocks.prisma.food.update.mock.calls[2][0].data.unitHint).toBeNull();
  });

  it("createOwnFood sin unitHint tampoco manda la clave", async () => {
    await createOwnFood(T, input);
    expect(mocks.prisma.food.create.mock.calls[0][0].data).not.toHaveProperty("unitHint");
  });
});

describe("HU-025: alimentos del consultorio", () => {
  const B = { tenantId: "tenant-b" };
  const readable = { OR: [{ source: "SARA2" }, { source: "PROPIO", tenantId: "tenant-b" }] };

  it("createOwnFood escribe el tenant del contexto", async () => {
    await createOwnFood(B, input);
    expect(mocks.prisma.food.create.mock.calls[0][0].data.tenantId).toBe("tenant-b");
  });

  it("un propio de otro consultorio es inexistente para leer, editar, activar y recalcular", async () => {
    mocks.prisma.food.findFirst.mockResolvedValue(null);
    await expect(getFood(B, "propio-de-a")).resolves.toBeNull();
    await expect(updateOwnFood(B, "propio-de-a", input)).rejects.toBeInstanceOf(FoodNotFoundError);
    await expect(setFoodActive(B, "propio-de-a", false)).rejects.toBeInstanceOf(FoodNotFoundError);
    await expect(applyAtwaterKcal(B, "propio-de-a")).rejects.toBeInstanceOf(FoodNotFoundError);
    for (const [arg] of mocks.prisma.food.findFirst.mock.calls) expect(arg.where).toEqual({ AND: [{ id: "propio-de-a" }, readable] });
    expect(mocks.prisma.food.update).not.toHaveBeenCalled();
    expect(mocks.prisma.food.updateMany).not.toHaveBeenCalled();
  });

  it("desactivar un SARA 2 escribe la preferencia del consultorio, nunca la columna global", async () => {
    mocks.prisma.food.findFirst.mockResolvedValue({ source: "SARA2" });
    mocks.prisma.foodVisibilityPreference = { upsert: vi.fn().mockResolvedValue({}) };
    await setFoodActive(B, "sara-1", false);
    expect(mocks.prisma.foodVisibilityPreference.upsert).toHaveBeenCalledWith({
      where: { tenantId_foodId: { tenantId: "tenant-b", foodId: "sara-1" } },
      create: { tenantId: "tenant-b", foodId: "sara-1", visible: false },
      update: { visible: false },
    });
    expect(mocks.prisma.food.update).not.toHaveBeenCalled();
    expect(mocks.prisma.food.updateMany).not.toHaveBeenCalled();
  });

  it("listFoods: activo = visible para el consultorio (preferencia del tenant y catálogo)", async () => {
    mocks.prisma.food.findMany.mockResolvedValue([
      { id: "s1", source: "SARA2", active: true, catalogActive: true, visibility: [{ visible: false }] },
      { id: "s2", source: "SARA2", active: true, catalogActive: true, visibility: [] },
      { id: "s3", source: "SARA2", active: false, catalogActive: false, visibility: [] },
      { id: "p1", source: "PROPIO", active: true, catalogActive: true, visibility: [] },
    ]);
    const list = await listFoods(B, { activeOnly: false });
    expect(list.map((f) => [f.id, f.active])).toEqual([["s1", false], ["s2", true], ["s3", false], ["p1", true]]);
    expect(list[0]).not.toHaveProperty("visibility");
    expect(mocks.prisma.food.findMany.mock.calls[0][0].where).toEqual({ AND: [readable] });
  });

  it("los conflictos de nombre no miran propios de otro consultorio", async () => {
    await findFoodNameConflicts(B, "Yogur");
    expect(mocks.prisma.food.findMany.mock.calls[0][0].where).toEqual({ AND: [readable] });
  });
});
