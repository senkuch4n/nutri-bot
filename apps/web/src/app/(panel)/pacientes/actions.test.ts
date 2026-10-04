// HU-017c-1: "Poner nombre" escribe solo Patient.name (no pisa notas ni fecha de nacimiento).
// HU-017c-2: "Editar datos" escribe la lista exacta de campos en una sola transacción.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db", () => ({
  prisma: {
    patient: { update: mocks.update },
    clinicalRecord: { upsert: mocks.upsert },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@nutri-bot/db/domain", () => ({ updatePatientFormulaData: vi.fn() }));

import { setPatientNameAction, updatePatientDataAction } from "./actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  mocks.revalidatePath.mockReset();
  mocks.update.mockReset();
  mocks.update.mockResolvedValue({});
  mocks.upsert.mockReset();
  mocks.upsert.mockResolvedValue({});
  mocks.transaction.mockReset();
  mocks.transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
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

describe("updatePatientDataAction", () => {
  const full = {
    id: "pat-1",
    name: "  Brenda Yebara ",
    birthDate: "1991-05-10",
    notes: " Prefiere turnos a la tarde ",
    sex: "FEMALE",
    activityLevel: "MODERATE",
    nutritionGoal: "LOSE_WEIGHT",
    bodyFrame: "",
    background: "Hipotiroidismo",
    goals: "Bajar 5 kg",
    riskFlag: "true",
  };

  it("escribe exactamente los 7 campos del paciente y la ficha clínica, en una transacción", async () => {
    const result = await updatePatientDataAction({ ok: false }, form(full));
    expect(result).toEqual({ ok: true });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.transaction.mock.calls[0]![0]).toHaveLength(2);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "pat-1" },
      data: {
        name: "Brenda Yebara",
        birthDate: new Date("1991-05-10T00:00:00.000Z"),
        notes: "Prefiere turnos a la tarde",
        sex: "FEMALE",
        activityLevel: "MODERATE",
        nutritionGoal: "LOSE_WEIGHT",
        bodyFrame: null,
      },
    });
    const clinical = { background: "Hipotiroidismo", goals: "Bajar 5 kg", riskFlag: true };
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { patientId: "pat-1" },
      update: clinical,
      create: { patientId: "pat-1", ...clinical },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pacientes/pat-1", "layout");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pacientes");
  });

  it('"" → null y sin la casilla de riesgo → false', async () => {
    const result = await updatePatientDataAction(
      { ok: false },
      form({ id: "pat-1", name: "", birthDate: "", notes: "  ", sex: "", activityLevel: "", nutritionGoal: "", bodyFrame: "", background: "", goals: "" }),
    );
    expect(result.ok).toBe(true);
    expect(mocks.update.mock.calls[0]![0].data).toEqual({
      name: null,
      birthDate: null,
      notes: null,
      sex: null,
      activityLevel: null,
      nutritionGoal: null,
      bodyFrame: null,
    });
    expect(mocks.upsert.mock.calls[0]![0].update).toEqual({ background: null, goals: null, riskFlag: false });
  });

  it("un valor de enum inválido no escribe nada", async () => {
    const result = await updatePatientDataAction({ ok: false }, form({ ...full, activityLevel: "MUCHO" }));
    expect(result).toEqual({ ok: false, error: "Datos inválidos" });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("nombre de 121 caracteres → error en el campo, sin escribir", async () => {
    const result = await updatePatientDataAction({ ok: false }, form({ ...full, name: "a".repeat(121) }));
    expect(result).toEqual({ ok: false, fieldErrors: { name: "El nombre puede tener hasta 120 caracteres" } });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("junta los errores de cada campo", async () => {
    const result = await updatePatientDataAction(
      { ok: false },
      form({ ...full, birthDate: "2026-02-30", notes: "n".repeat(2001), background: "b".repeat(4001), goals: "g".repeat(4001) }),
    );
    expect(result.ok).toBe(false);
    expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual(["background", "birthDate", "goals", "notes"]);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("si la transacción falla, devuelve el error genérico y no revalida", async () => {
    mocks.transaction.mockRejectedValue(new Error("boom"));
    const result = await updatePatientDataAction({ ok: false }, form(full));
    expect(result).toEqual({ ok: false, error: "No se pudo guardar. Probá de nuevo." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("sin id no escribe", async () => {
    const { id: _id, ...rest } = full;
    const result = await updatePatientDataAction({ ok: false }, form(rest));
    expect(result.ok).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
