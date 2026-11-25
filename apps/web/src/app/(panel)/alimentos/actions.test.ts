// HU-025 (025b-2 M7): las acciones de alimentos operan sobre el consultorio del contexto.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class FoodNotFoundError extends Error {}
  return {
    ctx: vi.fn(), revalidatePath: vi.fn(),
    setFoodActive: vi.fn(), applyAtwaterKcal: vi.fn(), updateOwnFood: vi.fn(),
    findFoodNameConflicts: vi.fn(), getFood: vi.fn(),
    FoodNotFoundError,
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/tenant-context", () => ({ requireTenantContext: mocks.ctx }));
vi.mock("@nutri-bot/db/domain", () => ({
  DuplicateOwnFoodNameError: class extends Error {},
  FoodNotEditableError: class extends Error {},
  InvalidOwnFoodError: class extends Error {},
  FoodNotFoundError: mocks.FoodNotFoundError,
  applyAtwaterKcal: mocks.applyAtwaterKcal,
  findFoodNameConflicts: mocks.findFoodNameConflicts,
  getFood: mocks.getFood,
  setFoodActive: mocks.setFoodActive,
  updateOwnFood: mocks.updateOwnFood,
}));

import { applyAtwaterKcalAction, setFoodActiveAction, updateOwnFoodAction } from "./actions";

const CTX_B = { userId: "u-b", tenantId: "tenant-b", agendaId: "agenda-b", professionalId: 7 };

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const OWN = {
  name: "Yogur casero", group: "YOGURES", proteinPer100: "3", carbsPer100: "4", fatPer100: "3",
  tenantId: "legacy-tenant", professionalId: "1",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.ctx.mockResolvedValue(CTX_B);
  mocks.findFoodNameConflicts.mockResolvedValue({ own: null, sara: null });
});

describe("alimentos (HU-025)", () => {
  it("activar/desactivar y recalcular kcal usan el contexto, nunca un tenant del cliente", async () => {
    await setFoodActiveAction("sara-1", false);
    await applyAtwaterKcalAction("own-1");
    expect(mocks.ctx).toHaveBeenCalledWith("write");
    expect(mocks.setFoodActive).toHaveBeenCalledWith(CTX_B, "sara-1", false);
    expect(mocks.applyAtwaterKcal).toHaveBeenCalledWith(CTX_B, "own-1");
  });

  it("editar un propio de otro consultorio da el mismo aviso que uno inexistente, sin escribir", async () => {
    mocks.getFood.mockResolvedValue(null);
    const res = await updateOwnFoodAction("propio-de-a", { ok: false }, form(OWN));
    expect(res).toEqual({ ok: false, error: "El alimento ya no existe." });
    expect(mocks.getFood).toHaveBeenCalledWith(CTX_B, "propio-de-a");
    expect(mocks.updateOwnFood).not.toHaveBeenCalled();
  });

  it("si el dominio dice que no existe (carrera), mismo aviso", async () => {
    mocks.getFood.mockResolvedValue({ id: "own-b", name: "Yogur casero" });
    mocks.updateOwnFood.mockRejectedValue(new mocks.FoodNotFoundError());
    const res = await updateOwnFoodAction("own-b", { ok: false }, form(OWN));
    expect(res).toEqual({ ok: false, error: "El alimento ya no existe." });
    expect(mocks.updateOwnFood.mock.calls[0]![0]).toBe(CTX_B);
  });

  it("sin contexto → error genérico, sin leer ni escribir", async () => {
    mocks.ctx.mockRejectedValue(new Error("tenant_access:no_context"));
    const res = await updateOwnFoodAction("own-b", { ok: false }, form(OWN));
    expect(res).toMatchObject({ ok: false, error: expect.any(String) });
    expect(mocks.getFood).not.toHaveBeenCalled();
    expect(mocks.updateOwnFood).not.toHaveBeenCalled();
  });
});
