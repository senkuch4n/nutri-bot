// HU-017c-1: "Poner nombre" escribe solo Patient.name (no pisa notas ni fecha de nacimiento).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  update: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db", () => ({ prisma: { patient: { update: mocks.update } } }));
vi.mock("@nutri-bot/db/domain", () => ({ updatePatientFormulaData: vi.fn() }));

import { setPatientNameAction } from "./actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  mocks.revalidatePath.mockReset();
  mocks.update.mockReset();
  mocks.update.mockResolvedValue({});
});

describe("setPatientNameAction", () => {
  it("guarda el nombre recortado y nada más", async () => {
    const result = await setPatientNameAction({ ok: false }, form({ id: "pat-1", name: "  Lucía Pérez  " }));
    expect(result).toEqual({ ok: true, name: "Lucía Pérez" });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "pat-1" }, data: { name: "Lucía Pérez" } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pacientes");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pacientes/pat-1");
  });

  it("pide el nombre si viene vacío o en blanco", async () => {
    const result = await setPatientNameAction({ ok: false }, form({ id: "pat-1", name: "   " }));
    expect(result).toEqual({ ok: false, error: "Escribí el nombre" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rechaza más de 120 caracteres", async () => {
    const result = await setPatientNameAction({ ok: false }, form({ id: "pat-1", name: "a".repeat(121) }));
    expect(result).toEqual({ ok: false, error: "El nombre puede tener hasta 120 caracteres" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("acepta exactamente 120 caracteres", async () => {
    const result = await setPatientNameAction({ ok: false }, form({ id: "pat-1", name: "a".repeat(120) }));
    expect(result.ok).toBe(true);
  });

  it("si la base falla, devuelve el error genérico", async () => {
    mocks.update.mockRejectedValue(Object.assign(new Error("Record not found"), { code: "P2025" }));
    const result = await setPatientNameAction({ ok: false }, form({ id: "pat-1", name: "Lucía" }));
    expect(result).toEqual({ ok: false, error: "No se pudo guardar. Probá de nuevo." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("sin id no escribe", async () => {
    const result = await setPatientNameAction({ ok: false }, form({ name: "Lucía" }));
    expect(result.ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
