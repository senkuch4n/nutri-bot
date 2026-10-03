// HU-018b-2: actions del editor semanal (domain mockeado, sin base).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  copyDay: vi.fn(), moveMeal: vi.fn(), renameMeal: vi.fn(), repeatMealInAllDays: vi.fn(),
  restoreMealSnapshots: vi.fn(), setMealMode: vi.fn(), setMealOptions: vi.fn(),
  revalidatePath: vi.fn(), findPlan: vi.fn(),
}));

vi.mock("@nutri-bot/db/domain", () => mocks);
vi.mock("@nutri-bot/db", () => ({ prisma: { nutritionPlan: { findUnique: mocks.findPlan } } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  copyDayAction,
  renameMealAction,
  restoreMealsAction,
  setMealModeAction,
  setMealOptionsAction,
} from "./weekly-menu-actions";

const snapshot = {
  mealId: "meal1", mode: "EVERY_DAY" as const, isOptions: false,
  items: [{ foodId: "f1", customLabel: null, quantityGrams: 150, notes: null, order: 0, weekday: null, recipeId: null, portions: null }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.findPlan.mockResolvedValue({ patientId: "pat1" });
});

describe("weekly-menu-actions", () => {
  it("copyDayAction devuelve las fotos para Deshacer y revalida las rutas del plan", async () => {
    mocks.copyDay.mockResolvedValue([snapshot]);
    const result = await copyDayAction({ kind: "plan", ownerId: "plan1", from: "MON", to: ["TUE", "WED"] });
    expect(result).toEqual({ ok: true, undo: [snapshot] });
    expect(mocks.copyDay).toHaveBeenCalledWith("plan", "plan1", { from: "MON", to: ["TUE", "WED"] });
    expect(mocks.revalidatePath.mock.calls).toEqual([["/pacientes/pat1"], ["/pacientes/pat1/planes/plan1"]]);
  });

  it("setMealModeAction en una plantilla devuelve [foto] y revalida /plantillas/{id}", async () => {
    mocks.setMealMode.mockResolvedValue(snapshot);
    const result = await setMealModeAction({ kind: "template", ownerId: "t1", mealId: "meal1", mode: "PER_DAY" });
    expect(result).toEqual({ ok: true, undo: [snapshot] });
    expect(mocks.setMealMode).toHaveBeenCalledWith("template", "t1", "meal1", { mode: "PER_DAY", keepWeekday: undefined });
    expect(mocks.revalidatePath.mock.calls).toEqual([["/plantillas/t1"]]);
  });

  it("setMealOptionsAction no devuelve undo", async () => {
    mocks.setMealOptions.mockResolvedValue(undefined);
    expect(await setMealOptionsAction({ kind: "plan", ownerId: "plan1", mealId: "m", isOptions: true })).toEqual({ ok: true });
  });

  it("un error del dominio se traduce al mensaje genérico", async () => {
    mocks.copyDay.mockRejectedValue(new Error("MealOwnershipError"));
    expect(await copyDayAction({ kind: "plan", ownerId: "plan1", from: "MON", to: ["TUE"] })).toEqual({
      ok: false, error: "No se pudo guardar. Probá de nuevo.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("valida la entrada con zod antes de llamar al dominio", async () => {
    const bad = [
      copyDayAction({ kind: "plan", ownerId: "plan1", from: "MON", to: [] }),
      copyDayAction({ kind: "plan", ownerId: "plan1", from: "MON", to: ["XXX" as never] }),
      renameMealAction({ kind: "plan", ownerId: "plan1", mealId: "m", name: "   " }),
      setMealModeAction({ kind: "otro" as never, ownerId: "plan1", mealId: "m", mode: "PER_DAY" }),
    ];
    for (const result of await Promise.all(bad)) expect(result.ok).toBe(false);
    expect(mocks.copyDay).not.toHaveBeenCalled();
    expect(mocks.renameMeal).not.toHaveBeenCalled();
    expect(mocks.setMealMode).not.toHaveBeenCalled();
  });

  it("restoreMealsAction acepta una foto válida y rechaza campos extra o gramos fuera de rango", async () => {
    mocks.restoreMealSnapshots.mockResolvedValue(undefined);
    expect(await restoreMealsAction({ kind: "plan", ownerId: "plan1", snapshots: [snapshot] })).toEqual({ ok: true });
    expect(mocks.restoreMealSnapshots).toHaveBeenCalledWith("plan", "plan1", [snapshot]);

    mocks.restoreMealSnapshots.mockClear();
    const extra = { ...snapshot, items: [{ ...snapshot.items[0], color: "rojo" }] };
    const huge = { ...snapshot, items: [{ ...snapshot.items[0]!, quantityGrams: 100000 }] };
    expect((await restoreMealsAction({ kind: "plan", ownerId: "plan1", snapshots: [extra] as never })).ok).toBe(false);
    expect((await restoreMealsAction({ kind: "plan", ownerId: "plan1", snapshots: [huge] })).ok).toBe(false);
    expect(mocks.restoreMealSnapshots).not.toHaveBeenCalled();
  });

  it("HU-018c: una foto con receta pasa; con receta y alimento no; sin los campos nuevos pasa con null", async () => {
    mocks.restoreMealSnapshots.mockResolvedValue(undefined);
    const recipeItem = { foodId: null, customLabel: null, quantityGrams: null, notes: null, order: 1, weekday: null, recipeId: "rec1", portions: 1.5 };
    const withRecipe = { ...snapshot, items: [snapshot.items[0]!, recipeItem] };
    expect(await restoreMealsAction({ kind: "plan", ownerId: "plan1", snapshots: [withRecipe] })).toEqual({ ok: true });
    expect(mocks.restoreMealSnapshots).toHaveBeenCalledWith("plan", "plan1", [withRecipe]);

    mocks.restoreMealSnapshots.mockClear();
    const bad = [
      { ...recipeItem, foodId: "f1" },
      { ...recipeItem, portions: null },
      { ...recipeItem, portions: 0.7 },
      { ...recipeItem, recipeId: null, foodId: "f1", portions: 1 },
    ];
    for (const item of bad) {
      expect((await restoreMealsAction({ kind: "plan", ownerId: "plan1", snapshots: [{ ...snapshot, items: [item] }] })).ok).toBe(false);
    }
    expect(mocks.restoreMealSnapshots).not.toHaveBeenCalled();

    const { recipeId: _r, portions: _p, ...legacyItem } = snapshot.items[0]!;
    const legacy = { ...snapshot, items: [legacyItem] };
    expect(await restoreMealsAction({ kind: "plan", ownerId: "plan1", snapshots: [legacy] as never })).toEqual({ ok: true });
    expect(mocks.restoreMealSnapshots).toHaveBeenCalledWith("plan", "plan1", [snapshot]);
  });
});
