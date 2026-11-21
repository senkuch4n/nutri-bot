import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  agenda: { findUnique: vi.fn() },
  professional: { findUnique: vi.fn() },
  consultation: { findMany: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  evolutionEntry: { findFirst: vi.fn(), updateMany: vi.fn() },
  nutritionPlan: { findUnique: vi.fn(), create: vi.fn() },
  planMeal: { createMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("../index", () => ({ prisma: db }));

import { AppointmentConsultationDateError, ConsultationNotDeletableError, ConsultationPlanMismatchError, createPlanForConsultation, deleteConsultation, FutureConsultationDateError, getConsultation, listPatientConsultations, saveConsultationNotes, setConsultationPlan, updateManualConsultationDate } from "./consultations";

const tenantId = "legacy-tenant";
const consultation = { id: "c1", patientId: "p1", tenantId, consultedAt: new Date("2026-09-13T01:00:00Z") };
const newPlan = { id: "new", patientId: "p1", tenantId, title: "Plan del 12/09/2026", status: "DRAFT" };
const professional = { timezone: "America/Argentina/Buenos_Aires" };
const consultationKey = { id: "c1", tenantId };
const planKey = { id: "plan", tenantId };

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((run) => run(db));
  db.agenda.findUnique.mockResolvedValue({ professional });
  db.professional.findUnique.mockResolvedValue(professional);
  db.nutritionPlan.create.mockResolvedValue(newPlan);
});

describe("private consultation reads and writes", () => {
  const patient = { id: "p1", tenantId };
  const owned = { ...consultation, patient, appointment: null, plan: null, prescription: null, evolutionEntries: [], planId: null, _count: { evolutionEntries: 0 } };
  const matches = (row: typeof owned, where: { id?: string; patientId?: string; tenantId?: string; patient?: { tenantId: string } }) =>
    (!where.id || where.id === row.id) && (!where.patientId || where.patientId === row.patientId) &&
    (!where.tenantId || where.tenantId === row.tenantId) && (!where.patient || where.patient.tenantId === row.patient.tenantId);

  it.each([
    { tenantId: "other-tenant", patient },
    { tenantId: null, patient },
    { tenantId, patient: { ...patient, tenantId: "other-tenant" } },
  ])("returns empty/not found without mutations for incompatible ownership: %j", async (override) => {
    const stored = { ...owned, notes: "original", ...override };
    db.consultation.findMany.mockImplementation(async ({ where }) => [stored].filter((row) => matches(row as typeof owned, where)));
    db.consultation.findUnique.mockImplementation(async ({ where }) => matches(stored as typeof owned, where) ? stored : null);
    db.consultation.update.mockImplementation(async ({ where, data }) => {
      if (!matches(stored as typeof owned, where)) throw new Error("Record not found");
      return Object.assign(stored, data);
    });
    await expect(listPatientConsultations("p1")).resolves.toEqual([]);
    await expect(getConsultation("c1")).resolves.toBeNull();
    await expect(saveConsultationNotes({ consultationId: "c1", notes: "changed" })).rejects.toThrow("Record not found");
    await expect(deleteConsultation("c1")).rejects.toThrow("La consulta no existe");
    expect(stored.notes).toBe("original");
    expect(db.consultation.deleteMany).not.toHaveBeenCalled();
  });

  it.each([
    { plan: { tenantId: "other-tenant", patientId: "p1" } },
    { plan: { tenantId, patientId: "other-patient" } },
    { appointment: { tenantId: "other-tenant", patientId: "p1", service: { tenantId } } },
    { appointment: { tenantId, patientId: "p1", service: { tenantId: null } } },
  ])("does not return a consultation with an incompatible to-one link: %j", async (link) => {
    db.consultation.findMany.mockResolvedValue([{ ...owned, ...link }]);
    db.consultation.findUnique.mockResolvedValue({ ...owned, ...link });
    await expect(listPatientConsultations("p1")).resolves.toEqual([]);
    await expect(getConsultation("c1")).resolves.toBeNull();
  });

  it("preserves owned list and detail results, without incompatible measurements", async () => {
    const entry = { id: "e1", tenantId, patientId: "p1" };
    const prescription = { id: "rx1", consultationId: "c1" };
    const plan = { id: "plan", title: "Plan", status: "DRAFT" };
    const appointment = { tenantId, patientId: "p1", service: { tenantId } };
    const row = { ...owned, prescription, plan: { ...plan, tenantId, patientId: "p1" }, appointment, evolutionEntries: [
      entry, { ...entry, tenantId: "other-tenant" }, { ...entry, tenantId: null }, { ...entry, patientId: "other-patient" },
    ] };
    db.consultation.findMany.mockResolvedValue([row]);
    db.consultation.findUnique.mockResolvedValue(row);
    const expected = { ...owned, prescription, plan, appointment, evolutionEntries: [entry] };
    await expect(listPatientConsultations("p1")).resolves.toEqual([expected]);
    await expect(getConsultation("c1")).resolves.toEqual(expected);
    expect(db.consultation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ consultedAt: "desc" }, { createdAt: "desc" }],
    }));
  });

  it("trims notes and clears blank notes on an owned consultation", async () => {
    db.consultation.update.mockImplementation(async ({ where, data }) => {
      expect(where).toEqual({ id: "c1", tenantId, patient: { tenantId } });
      return { ...owned, ...data };
    });
    await expect(saveConsultationNotes({ consultationId: "c1", notes: " hola " })).resolves.toMatchObject({ notes: "hola" });
    await expect(saveConsultationNotes({ consultationId: "c1", notes: " " })).resolves.toMatchObject({ notes: null });
  });

  it("blocks content and repeats ownership and content guards when deleting", async () => {
    db.consultation.findUnique.mockResolvedValueOnce({ ...owned, _count: { evolutionEntries: 1 } }).mockResolvedValue(owned);
    await expect(deleteConsultation("c1")).rejects.toThrow(ConsultationNotDeletableError);
    expect(db.consultation.deleteMany).not.toHaveBeenCalled();
    db.consultation.deleteMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValue({ count: 1 });
    await expect(deleteConsultation("c1")).rejects.toThrow(ConsultationNotDeletableError);
    await expect(deleteConsultation("c1")).resolves.toBeUndefined();
    expect(db.consultation.deleteMany).toHaveBeenCalledWith({ where: {
      id: "c1", tenantId, patient: { tenantId }, planId: null, evolutionEntries: { none: {} }, prescription: { is: null },
    } });
  });

  it("fails closed when the original agenda cannot be verified", async () => {
    db.agenda.findUnique.mockResolvedValue(null);
    for (const run of [() => listPatientConsultations("p1"), () => getConsultation("c1"),
      () => saveConsultationNotes({ consultationId: "c1", notes: null }), () => deleteConsultation("c1")]) {
      await expect(run()).rejects.toThrow("No se pudo verificar la agenda de la instalación original.");
    }
    for (const query of Object.values(db.consultation)) expect(query).not.toHaveBeenCalled();
  });
});

function mockConsultation(owner: string | null) {
  db.consultation.findUniqueOrThrow.mockImplementation(async ({ where }) => {
    if (where.id_tenantId && where.id_tenantId.tenantId !== owner) throw new Error("Record not found");
    return { ...consultation, tenantId: owner };
  });
}

function expectNoWrites() {
  expect(db.consultation.update).not.toHaveBeenCalled();
  expect(db.nutritionPlan.create).not.toHaveBeenCalled();
  expect(db.planMeal.createMany).not.toHaveBeenCalled();
}

describe("changing a manual consultation date", () => {
  const move = (dayKey = "2020-09-14") => updateManualConsultationDate({ consultationId: "c1", dayKey });
  const noon = new Date("2020-09-14T15:00:00Z");
  const expectNoDateWrites = () => {
    expect(db.consultation.update).not.toHaveBeenCalled();
    expect(db.evolutionEntry.updateMany).not.toHaveBeenCalled();
  };

  it.each(["other-tenant", null])("rejects a consultation owned by %s", async (owner) => {
    mockConsultation(owner);
    await expect(move()).rejects.toThrow("Record not found");
    expectNoDateWrites();
  });

  it("fails closed without the verified agenda", async () => {
    mockConsultation(tenantId);
    db.agenda.findUnique.mockResolvedValue(null);
    await expect(move()).rejects.toThrow("No se pudo verificar la agenda de la instalación original.");
    expectNoDateWrites();
  });

  it.each([
    { tenantId: "other-tenant", patientId: "p1" },
    { tenantId: null, patientId: "p1" },
    { tenantId, patientId: "other-patient" },
  ])("rejects a mismatched linked evolution entry before writing: %j", async (row) => {
    mockConsultation(tenantId);
    db.evolutionEntry.findFirst.mockImplementation(async ({ where }) => {
      expect(where).toEqual({ consultationId: "c1", OR: [
        { patientId: { not: "p1" } }, { tenantId: { not: tenantId } }, { tenantId: null },
      ] });
      return where.OR.some((filter: { patientId?: { not: string }; tenantId?: { not: string } | null }) =>
        filter.patientId ? row.patientId !== filter.patientId.not :
          filter.tenantId === null ? row.tenantId === null : row.tenantId !== null && row.tenantId !== filter.tenantId?.not)
        ? { id: "e1" } : null;
    });
    await expect(move()).rejects.toThrow("Las mediciones no coinciden con el paciente y consultorio de la consulta");
    expectNoDateWrites();
  });

  it("moves the consultation and its owned measurements to local noon, excluding a late foreign entry", async () => {
    mockConsultation(tenantId);
    db.evolutionEntry.findFirst.mockResolvedValue(null);
    const updated = { ...consultation, consultedAt: noon };
    const ownEntry = { tenantId, patientId: "p1", consultationId: "c1", recordedAt: consultation.consultedAt };
    const entries = [ownEntry];
    db.consultation.update.mockImplementation(async () => {
      entries.push({ ...ownEntry, tenantId: "other-tenant" });
      return updated;
    });
    db.evolutionEntry.updateMany.mockImplementation(async ({ where, data }) => {
      const matched = entries.filter((row) => Object.entries(where).every(([key, value]) => row[key as keyof typeof row] === value));
      matched.forEach((row) => Object.assign(row, data));
      return { count: matched.length };
    });
    await expect(move()).resolves.toEqual(updated);
    expect(db.consultation.update).toHaveBeenCalledWith({
      where: { id_tenantId: consultationKey, patientId: "p1", AND: { appointmentId: null } }, data: { consultedAt: noon },
    });
    expect(entries.map(({ recordedAt }) => recordedAt)).toEqual([noon, consultation.consultedAt]);
  });

  it("preserves invalid, future and appointment date errors without writing", async () => {
    db.consultation.findUniqueOrThrow.mockResolvedValue({ ...consultation, appointmentId: "a1" });
    await expect(move("2020-02-30")).rejects.toThrow("Fecha inválida");
    await expect(move("2099-01-01")).rejects.toThrow(new FutureConsultationDateError());
    await expect(move()).rejects.toThrow(new AppointmentConsultationDateError());
    expectNoDateWrites();
  });
});

const operations = {
  link: () => setConsultationPlan({ consultationId: "c1", planId: "plan" }),
  unlink: () => setConsultationPlan({ consultationId: "c1", planId: null }),
  create: () => createPlanForConsultation({ consultationId: "c1" }),
};

describe("consultation → plan writes", () => {
  it.each(Object.keys(operations) as (keyof typeof operations)[])("%s fails closed without a verified legacy agenda", async (op) => {
    db.agenda.findUnique.mockResolvedValue(null);
    mockConsultation(tenantId);
    await expect(operations[op]()).rejects.toThrow("No se pudo verificar la agenda de la instalación original.");
    expect(db.agenda.findUnique).toHaveBeenCalledWith({
      where: { id_tenantId: { id: "legacy-agenda", tenantId }, isPrimary: true, professionalId: 1 },
      select: { professional: { select: { timezone: true, phoneJid: true } } },
    });
    expect(db.consultation.findUniqueOrThrow).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it.each(["other-tenant", null])("rejects all three writes against a consultation owned by %s", async (owner) => {
    mockConsultation(owner);
    await expect(operations.link()).rejects.toThrow("Record not found");
    await expect(operations.create()).rejects.toThrow("Record not found");
    expectNoWrites();
    const stored = { ...consultation, tenantId: owner, planId: "old-plan" };
    db.consultation.update.mockImplementation(async ({ where, data }) => {
      if (where.id_tenantId && where.id_tenantId.tenantId !== stored.tenantId) throw new Error("Record not found");
      return Object.assign(stored, data);
    });
    await expect(operations.unlink()).rejects.toThrow("Record not found");
    expect(stored.planId).toBe("old-plan");
  });

  it.each([
    { tenantId: "other-tenant", patientId: "p1" },
    { tenantId: null, patientId: "p1" },
    { tenantId, patientId: "other-patient" },
    null,
  ])("rejects an incompatible or missing plan: %j", async (plan) => {
    mockConsultation(tenantId);
    db.nutritionPlan.findUnique.mockImplementation(async ({ where }) => {
      if (where.id_tenantId && where.id_tenantId.tenantId !== plan?.tenantId) return null;
      if (where.patientId && where.patientId !== plan?.patientId) return null;
      return plan;
    });
    await expect(operations.link()).rejects.toThrow(ConsultationPlanMismatchError);
    expectNoWrites();
  });

  it("links a same-tenant, same-patient plan through scoped selectors", async () => {
    mockConsultation(tenantId);
    db.nutritionPlan.findUnique.mockResolvedValue({ id: "plan", patientId: "p1", tenantId });
    const linked = { ...consultation, planId: "plan" };
    db.consultation.update.mockResolvedValue(linked);
    await expect(operations.link()).resolves.toEqual(linked);
    expect(db.consultation.update).toHaveBeenCalledWith({
      where: { id_tenantId: consultationKey, patientId: "p1" },
      data: { plan: { connect: { id_tenantId: planKey, patientId: "p1" } } },
    });
    expect(db.nutritionPlan.create).not.toHaveBeenCalled();
  });

  it("clears the plan from an owned consultation without looking up the old plan", async () => {
    mockConsultation(tenantId);
    const cleared = { ...consultation, planId: null };
    db.consultation.update.mockResolvedValue(cleared);
    await expect(operations.unlink()).resolves.toEqual(cleared);
    expect(db.consultation.update).toHaveBeenCalledWith({
      where: { id_tenantId: consultationKey }, data: { planId: null },
    });
    expect(db.nutritionPlan.findUnique).not.toHaveBeenCalled();
  });

  it("creates an owned draft with the original local-date title and five meals, then links it", async () => {
    mockConsultation(tenantId);
    await expect(operations.create()).resolves.toEqual(newPlan);
    const { id, ...data } = newPlan;
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.nutritionPlan.create).toHaveBeenCalledWith({ data });
    expect(db.planMeal.createMany).toHaveBeenCalledWith({ data: [
      { planId: id, name: "Desayuno", order: 0, mode: "PER_DAY", isOptions: false },
      { planId: id, name: "Almuerzo", order: 1, mode: "PER_DAY", isOptions: false },
      { planId: id, name: "Merienda", order: 2, mode: "PER_DAY", isOptions: false },
      { planId: id, name: "Cena", order: 3, mode: "PER_DAY", isOptions: false },
      { planId: id, name: "Colaciones", order: 4, mode: "EVERY_DAY", isOptions: true },
    ] });
    expect(db.consultation.update).toHaveBeenCalledWith({
      where: { id_tenantId: consultationKey, patientId: "p1" }, data: { planId: id },
    });
  });
});
