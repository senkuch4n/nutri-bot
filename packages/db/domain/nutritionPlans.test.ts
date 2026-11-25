import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  agenda: { findFirst: vi.fn() },
  patient: { findUniqueOrThrow: vi.fn() },
  nutritionPlan: { create: vi.fn() },
  planMeal: { createMany: vi.fn() },
}));
vi.mock("../index", () => ({ prisma: db }));

import { createPlan } from "./nutritionPlans";

const T = { tenantId: "legacy-tenant" };

const tenantId = "legacy-tenant";
const patientId = "p1";
const data = { title: "Plan manual", notes: "Notas" };

function mockPatient(owner: string | null | undefined) {
  db.patient.findUniqueOrThrow.mockImplementation(async ({ where }) => {
    if (where.id_tenantId.id !== patientId || where.id_tenantId.tenantId !== owner) {
      throw new Error("Record not found");
    }
    return { id: patientId };
  });
}

function expectNoWrites() {
  expect(db.nutritionPlan.create).not.toHaveBeenCalled();
  expect(db.planMeal.createMany).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((run) => run(db));
  db.agenda.findFirst.mockResolvedValue({ id: "legacy-agenda", tenantId, professionalId: 1, professional: { timezone: "America/Argentina/Buenos_Aires" } });
  db.nutritionPlan.create.mockImplementation(async ({ data }) => ({ id: "new-plan", ...data }));
});

describe("createPlan", () => {
  it("creates an owned draft and the default meals without honoring extra caller-supplied ownership fields", async () => {
    mockPatient(tenantId);
    const input = { ...data, tenantId: "other-tenant", patientId: "other-patient", status: "ACTIVE" };
    const created = { ...data, patientId, tenantId, status: "DRAFT" };
    await expect(createPlan(T, patientId, input)).resolves.toEqual({ id: "new-plan", ...created });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.patient.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id_tenantId: { id: patientId, tenantId } }, select: { id: true },
    });
    expect(db.nutritionPlan.create).toHaveBeenCalledTimes(1);
    expect(db.nutritionPlan.create).toHaveBeenCalledWith({ data: created });
    expect(db.planMeal.createMany).toHaveBeenCalledTimes(1);
    expect(db.planMeal.createMany).toHaveBeenCalledWith({ data: [
      { planId: "new-plan", name: "Desayuno", order: 0, mode: "PER_DAY", isOptions: false },
      { planId: "new-plan", name: "Almuerzo", order: 1, mode: "PER_DAY", isOptions: false },
      { planId: "new-plan", name: "Merienda", order: 2, mode: "PER_DAY", isOptions: false },
      { planId: "new-plan", name: "Cena", order: 3, mode: "PER_DAY", isOptions: false },
      { planId: "new-plan", name: "Colaciones", order: 4, mode: "EVERY_DAY", isOptions: true },
    ] });
  });

  it.each(["other-tenant", null, undefined])("rejects a foreign, unowned, or missing patient (%s)", async (owner) => {
    mockPatient(owner);
    await expect(createPlan(T, patientId, data)).rejects.toThrow("Record not found");
    expectNoWrites();
  });

  it("fails closed when the original agenda cannot be verified", async () => {
    db.agenda.findFirst.mockResolvedValue(null);
    await expect(createPlan(T, patientId, data)).rejects.toThrow("tenant_scope:tenant_scope_missing");
    expect(db.patient.findUniqueOrThrow).not.toHaveBeenCalled();
    expectNoWrites();
  });
});
