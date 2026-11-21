import { expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { seedBase, seedScheduling } from "./seed";

const settings = { timezone: "UTC", currency: "ARS", reminderLeadHours: 24 };
const profile = { name: "Nutricionista", email: "test@example.invalid", phoneJid: null };
const tenantId = "legacy-tenant";
const agendaId = "legacy-agenda";

function fixture() {
  const tx = {
    professional: { upsert: vi.fn() },
    agenda: { upsert: vi.fn() },
    botStatus: { upsert: vi.fn() },
    service: { count: vi.fn(), createMany: vi.fn() },
    availabilityRule: { count: vi.fn(), createMany: vi.fn() },
  };
  const db = {
    $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)),
    food: { count: vi.fn(), createMany: vi.fn() },
  };
  const client = db as unknown as PrismaClient;
  return { tx, db, run: () => seedScheduling(client, settings, profile), runBase: () => seedBase(client, settings, profile) };
}

it("provisions the canonical binding and owned defaults; replay preserves existing defaults and bot status", async () => {
  const { tx, db, run } = fixture();
  tx.service.count.mockResolvedValueOnce(0).mockResolvedValueOnce(3);
  tx.availabilityRule.count.mockResolvedValueOnce(0).mockResolvedValueOnce(10);
  await run();
  await run();
  expect(db.$transaction).toHaveBeenCalledTimes(2);
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  const professional = {
    where: { id: 1, tenantId },
    update: settings,
    create: { id: 1, tenantId, ...profile, ...settings },
    select: { id: true },
  };
  expect(tx.professional.upsert.mock.calls).toEqual([[professional], [professional]]);
  const agenda = {
    where: { id: agendaId, tenantId, professionalId: 1, isPrimary: true },
    update: {},
    create: { id: agendaId, tenantId, professionalId: 1, isPrimary: true },
  };
  expect(tx.agenda.upsert.mock.calls).toEqual([[agenda], [agenda]]);
  const botStatus = { where: { id: 1 }, update: {}, create: { id: 1, connected: false } };
  expect(tx.botStatus.upsert.mock.calls).toEqual([[botStatus], [botStatus]]);
  expect(tx.service.createMany).toHaveBeenCalledTimes(1);
  expect(tx.service.createMany).toHaveBeenCalledWith({ data: [
    expect.objectContaining({ tenantId, name: "Primera consulta" }),
    expect.objectContaining({ tenantId, name: "Consulta de seguimiento" }),
    expect.objectContaining({ tenantId, name: "Antropometría" }),
  ] });
  expect(tx.availabilityRule.createMany).toHaveBeenCalledTimes(1);
  expect(tx.availabilityRule.createMany).toHaveBeenCalledWith({
    data: [1, 2, 3, 4, 5].flatMap((weekday) => [
      { agendaId, weekday, startTime: "09:00", endTime: "13:00" },
      { agendaId, weekday, startTime: "15:00", endTime: "19:00" },
    ]),
  });
});

it("does not adopt unscoped or unrelated service/rule rows or append defaults to a nonempty table", async () => {
  const { tx, run } = fixture();
  tx.service.count.mockResolvedValue(1);
  tx.availabilityRule.count.mockResolvedValue(1);
  await run();
  expect(tx.service.count.mock.calls).toEqual([[]]);
  expect(tx.availabilityRule.count.mock.calls).toEqual([[]]);
  expect(tx.service.createMany).not.toHaveBeenCalled();
  expect(tx.availabilityRule.createMany).not.toHaveBeenCalled();
});

it.each(["professional", "agenda"] as const)("stops scheduling and status writes after a conflicting %s key", async (model) => {
  const { tx, db, runBase } = fixture();
  const conflict = Object.assign(new Error("Unique key conflict"), { code: "P2002" });
  tx[model].upsert.mockRejectedValue(conflict);
  await expect(runBase()).rejects.toBe(conflict);
  expect(db.food.count).not.toHaveBeenCalled();
  expect(db.food.createMany).not.toHaveBeenCalled();
  if (model === "professional") expect(tx.agenda.upsert).not.toHaveBeenCalled();
  expect(tx.botStatus.upsert).not.toHaveBeenCalled();
  expect(tx.service.createMany).not.toHaveBeenCalled();
  expect(tx.availabilityRule.createMany).not.toHaveBeenCalled();
});

it("preserves the global empty-food-table guard and never adopts existing rows", async () => {
  const { tx, db, runBase } = fixture();
  tx.service.count.mockResolvedValue(1);
  tx.availabilityRule.count.mockResolvedValue(1);
  db.food.count.mockResolvedValue(1);

  await expect(runBase()).resolves.toBeUndefined();
  expect(db.food.count.mock.calls).toEqual([[]]);
  expect(db.food.createMany).not.toHaveBeenCalled();
});
