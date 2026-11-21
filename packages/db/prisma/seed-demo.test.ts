import { FoodSource, type Prisma, type PrismaClient } from "@prisma/client";
import { expect, it, vi } from "vitest";
import { seedBase } from "./seed";
import { seedDemo } from "./seed-demo";

vi.mock("../index", () => ({ prisma: {} }));

const tenantId = "legacy-tenant";
const agendaId = "legacy-agenda";

function fixture() {
  const tx = {
    agenda: { findUnique: vi.fn().mockResolvedValue({ professional: {} }) },
    service: { findMany: vi.fn().mockResolvedValue(["Primera consulta", "Consulta de seguimiento", "Antropometría"].map((name) => ({ id: name, name, durationMin: 30, price: 100 }))) },
    food: { findMany: vi.fn().mockResolvedValue([]) },
    patient: { upsert: vi.fn(({ create }: { create: { id: string } }) => Promise.resolve({ id: create.id })) },
    clinicalRecord: { create: vi.fn() },
    evolutionEntry: { create: vi.fn() },
    appointment: { create: vi.fn().mockResolvedValue({ id: "appointment" }) },
    nutritionPlan: { create: vi.fn().mockResolvedValue({ id: "plan" }) },
    planMeal: { create: vi.fn().mockResolvedValue({ id: "meal" }) },
    planMealItem: { create: vi.fn() },
    payment: { create: vi.fn() },
    diaryEntry: { create: vi.fn() },
  };
  const db = { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<void>) => run(tx)) };
  const run = () => seedDemo(db as unknown as PrismaClient);
  return { tx, db, run };
}

it("refuses to seed when the original agenda cannot be verified", async () => {
  const { tx, run } = fixture();
  tx.agenda.findUnique.mockResolvedValue(null);
  await expect(Promise.resolve().then(run)).rejects.toThrow("No se pudo verificar la agenda de la instalación original.");
  expect(tx.agenda.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id_tenantId: { id: agendaId, tenantId }, isPrimary: true, professionalId: 1 } }));
  expect(tx.service.findMany).not.toHaveBeenCalled();
  expect(tx.patient.upsert).not.toHaveBeenCalled();
});

it("refuses an existing same-scope JID without overwriting or attaching records", async () => {
  const { tx, run } = fixture();
  tx.patient.upsert.mockResolvedValueOnce({ id: "existing" });
  await expect(Promise.resolve().then(run)).rejects.toThrow("El JID de demo ya existe en la instalación original; no se modificaron sus datos.");
  expect(tx.patient.upsert).toHaveBeenCalledTimes(1);
  expect(tx.patient.upsert).toHaveBeenCalledWith({
    where: { tenantId_whatsappJid: { tenantId, whatsappJid: "5493415551234@s.whatsapp.net" } },
    create: expect.objectContaining({ tenantId, id: expect.any(String) }),
    update: {},
  });
  expect(tx.clinicalRecord.create).not.toHaveBeenCalled();
  expect(tx.evolutionEntry.create).not.toHaveBeenCalled();
  expect(tx.appointment.create).not.toHaveBeenCalled();
  expect(tx.nutritionPlan.create).not.toHaveBeenCalled();
});

it("uses owned prerequisites and writes owned dependent fixtures from a newly created patient", async () => {
  const { tx, db, run } = fixture();
  const foods: Prisma.FoodCreateManyInput[] = [];
  const provision = {
    professional: { upsert: vi.fn() },
    agenda: { upsert: vi.fn() },
    botStatus: { upsert: vi.fn() },
    service: { count: vi.fn().mockResolvedValue(0), createMany: vi.fn() },
    availabilityRule: { count: vi.fn().mockResolvedValue(0), createMany: vi.fn() },
  };
  const baseDb = {
    $transaction: async (write: (client: typeof provision) => Promise<void>) => write(provision),
    food: {
      count: async () => foods.length,
      createMany: async ({ data }: { data: Prisma.FoodCreateManyInput[] }) => { foods.push(...data); },
    },
  };
  tx.food.findMany.mockImplementation(async ({ where }) => foods
    .filter((food) => (food.source ?? FoodSource.PROPIO) === where.source && (food.tenantId ?? null) === where.tenantId)
    .map((food) => ({ id: food.name, name: food.name })));

  await seedBase(baseDb as unknown as PrismaClient, { timezone: "UTC", currency: "ARS", reminderLeadHours: 24 }, {
    name: "Nutricionista", email: "test@example.invalid", phoneJid: null,
  });
  await expect(run()).resolves.toBeUndefined();
  expect(foods.length).toBeGreaterThan(0);
  for (const food of foods) {
    expect(food).toMatchObject({ source: FoodSource.PROPIO, tenantId });
    expect(food.sourceKey).toBeUndefined();
  }
  expect(db.$transaction).toHaveBeenCalledTimes(1);
  expect(tx.service.findMany).toHaveBeenCalledWith({ where: { tenantId } });
  expect(tx.food.findMany).toHaveBeenCalledWith({ where: { source: "PROPIO", tenantId } });
  const patientId = tx.patient.upsert.mock.calls[0]?.[0].create.id;
  expect(patientId).toEqual(expect.any(String));
  expect(tx.clinicalRecord.create).toHaveBeenCalledWith({ data: expect.objectContaining({ patientId }) });
  expect(tx.evolutionEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId, patientId }) });
  expect(tx.appointment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId, agendaId, patientId, serviceId: "Primera consulta", needsGoogleSync: false }) });
  expect(tx.nutritionPlan.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId, patientId, status: "ACTIVE" }) });
  expect(tx.planMealItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ foodId: "Yogur descremado", mealId: "meal" }) });
  expect(tx.patient.upsert).toHaveBeenCalledTimes(5);
  expect(tx.payment.create).toHaveBeenCalledTimes(3);
});

it("propagates a collision with the transitional global unique index", async () => {
  const { tx, run } = fixture();
  const collision = Object.assign(new Error("Unique constraint"), { code: "P2002" });
  tx.patient.upsert.mockRejectedValueOnce(collision);
  await expect(run()).rejects.toBe(collision);
  expect(tx.patient.upsert).toHaveBeenCalledTimes(1);
  expect(tx.clinicalRecord.create).not.toHaveBeenCalled();
  expect(tx.appointment.create).not.toHaveBeenCalled();
});
