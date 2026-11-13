// HU-017c-1: "Poner nombre" escribe solo Patient.name (no pisa notas ni fecha de nacimiento).
// HU-017c-2: "Editar datos" escribe la lista exacta de campos en una sola transacción.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  transaction: vi.fn(),
  findUnique: vi.fn(),
  findOrCreatePatient: vi.fn(),
  archivePatient: vi.fn(),
  unarchivePatient: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db", () => ({
  prisma: {
    patient: { update: mocks.update, findUnique: mocks.findUnique },
    clinicalRecord: { upsert: mocks.upsert },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@nutri-bot/db/domain", () => ({
  archivePatient: mocks.archivePatient,
  unarchivePatient: mocks.unarchivePatient,
  updatePatientFormulaData: vi.fn(),
  getProfessional: vi.fn(async () => ({ timezone: "America/Argentina/Buenos_Aires" })),
}));

vi.mock("@/lib/patients", () => ({
  findOrCreatePatient: mocks.findOrCreatePatient,
  phoneToJid: (phone: string) => `${phone.replace(/\D/g, "")}@s.whatsapp.net`,
}));

import {
  archivePatientAction,
  createPatientAction,
  setPatientNameAction,
  unarchivePatientAction,
  updatePatientDataAction,
} from "./actions";

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
  mocks.findUnique.mockReset();
  mocks.findOrCreatePatient.mockReset();
  mocks.findOrCreatePatient.mockResolvedValue({ id: "pat-new" });
  mocks.archivePatient.mockReset();
  mocks.unarchivePatient.mockReset();
});

describe("createPatientAction", () => {
  it("normaliza el teléfono, crea la paciente y devuelve su id", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const result = await createPatientAction({ ok: false }, form({ name: " Lucía Pérez ", phone: "0351 15 555 2345" }));
    expect(result).toEqual({ ok: true, id: "pat-new", name: "Lucía Pérez" });
    expect(mocks.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { whatsappJid: "5493515552345@s.whatsapp.net" } }),
    );
    expect(mocks.findOrCreatePatient).toHaveBeenCalledWith({ phone: "5493515552345", name: "Lucía Pérez" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pacientes");
  });

  it("número que ya es de otra paciente → no crea nada y ofrece su ficha", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "pat-9",
      name: "María Gómez",
      phone: "5493515552345",
      whatsappJid: "5493515552345@s.whatsapp.net",
    });
    const result = await createPatientAction({ ok: false }, form({ name: "Lucía", phone: "351 555 2345" }));
    expect(result).toEqual({
      ok: false,
      existingId: "pat-9",
      fieldErrors: { phone: "Ese número ya es de María Gómez" },
    });
    expect(mocks.findOrCreatePatient).not.toHaveBeenCalled();
  });

  it("HU-019: número de una archivada → no crea nada y ofrece desarchivarla", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "pat-7",
      name: "Ana López",
      phone: "5491155551234",
      whatsappJid: "5491155551234@s.whatsapp.net",
      archivedAt: new Date("2026-10-01T12:00:00Z"),
    });
    const result = await createPatientAction({ ok: false }, form({ name: "Ana", phone: "11 5555-1234" }));
    expect(result).toEqual({
      ok: false,
      existingId: "pat-7",
      existingArchived: true,
      fieldErrors: { phone: "Ese número es de Ana López, que está archivada." },
    });
    expect(mocks.findOrCreatePatient).not.toHaveBeenCalled();
  });

  it("valida nombre y teléfono sin tocar la base", async () => {
    const result = await createPatientAction({ ok: false }, form({ name: " ", phone: "555 2345" }));
    expect(result).toEqual({
      ok: false,
      fieldErrors: { name: "Escribí el nombre", phone: "Revisá el número: tiene que tener código de área" },
    });
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.findOrCreatePatient).not.toHaveBeenCalled();
  });
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

  it("una fecha de nacimiento futura → error en el campo, sin escribir", async () => {
    const result = await updatePatientDataAction({ ok: false }, form({ ...full, birthDate: "2999-01-01" }));
    expect(result).toEqual({ ok: false, fieldErrors: { birthDate: "La fecha de nacimiento no puede ser futura" } });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("si la transacción falla, devuelve el error genérico y no revalida", async () => {
    mocks.transaction.mockRejectedValue(new Error("boom"));
    const result = await updatePatientDataAction({ ok: false }, form(full));
    expect(result).toEqual({ ok: false, error: "No se pudo guardar. Probá de nuevo." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("sin id no escribe", async () => {
    const result = await updatePatientDataAction({ ok: false }, form({ ...full, id: "" }));
    expect(result.ok).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("archivePatientAction (HU-019)", () => {
  it("ok → revalida lista, ficha y avisos y devuelve el nombre", async () => {
    mocks.archivePatient.mockResolvedValue({ ok: true, archivedAt: new Date() });
    mocks.findUnique.mockResolvedValue({ name: " Ana López " });
    const r = await archivePatientAction("pat-1");
    expect(r).toEqual({ ok: true, name: "Ana López" });
    expect(mocks.archivePatient).toHaveBeenCalledWith("pat-1", expect.any(Date));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pacientes");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pacientes/pat-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/avisos");
  });

  it("turno pendiente → blocked con el texto de archiveBlockedText, sin revalidar", async () => {
    // Jueves 30/10/2025 10:00 en Buenos Aires; now en 2025 para que no muestre el año.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-10-24T15:00:00Z"));
    try {
      mocks.archivePatient.mockResolvedValue({
        ok: false,
        reason: "pending_appointments",
        next: { startsAt: new Date("2025-10-30T13:00:00Z"), status: "CONFIRMED" },
        moreCount: 0,
      });
      mocks.findUnique.mockResolvedValue({ name: "Ana López" });
      const r = await archivePatientAction("pat-1");
      expect(r).toEqual({
        ok: false,
        blocked: true,
        error: "Ana tiene un turno el jueves 30/10 a las 10:00. Cancelalo antes de archivarla.",
      });
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("not_found o excepción → archiveError", async () => {
    mocks.archivePatient.mockResolvedValue({ ok: false, reason: "not_found" });
    expect(await archivePatientAction("nope")).toEqual({ ok: false, error: "No se pudo archivar. Probá de nuevo." });
    mocks.archivePatient.mockRejectedValue(new Error("db"));
    expect(await archivePatientAction("pat-1")).toEqual({ ok: false, error: "No se pudo archivar. Probá de nuevo." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("id vacío → error sin llamar al domain", async () => {
    expect(await archivePatientAction("  ")).toEqual({ ok: false, error: "No se pudo archivar. Probá de nuevo." });
    expect(mocks.archivePatient).not.toHaveBeenCalled();
  });
});

describe("unarchivePatientAction (HU-019)", () => {
  it("ok → revalida y devuelve el nombre (null si no tiene)", async () => {
    mocks.unarchivePatient.mockResolvedValue({ ok: true });
    mocks.findUnique.mockResolvedValue({ name: null });
    expect(await unarchivePatientAction("pat-1")).toEqual({ ok: true, name: null });
    expect(mocks.unarchivePatient).toHaveBeenCalledWith("pat-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pacientes");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pacientes/pat-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/avisos");
  });

  it("not_found o excepción → unarchiveError", async () => {
    mocks.unarchivePatient.mockResolvedValue({ ok: false, reason: "not_found" });
    expect(await unarchivePatientAction("nope")).toEqual({ ok: false, error: "No se pudo desarchivar. Probá de nuevo." });
    mocks.unarchivePatient.mockRejectedValue(new Error("db"));
    expect(await unarchivePatientAction("pat-1")).toEqual({ ok: false, error: "No se pudo desarchivar. Probá de nuevo." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
