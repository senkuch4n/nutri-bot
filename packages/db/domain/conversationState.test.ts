import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  agenda: { findUnique: vi.fn() },
  patient: { findMany: vi.fn() },
  tenant: { findMany: vi.fn() },
  conversationState: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), createMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock("../index", () => ({ prisma: db }));

import {
  clearExpiredLegacyConversationText,
  clearExpiredConversationText,
  listTenantsWithExpiredConversationText,
  findLegacyConversationState,
  listPatientLastContacts,
  loadOrInitializeLegacyConversationState,
  saveLegacyConversationState,
} from "./conversationState";

const jid = "12345:2@lid";
const tenantId = "legacy-tenant";
const owner = { tenantId };
const key = { tenantId_patientJid: { tenantId, patientJid: jid } };
const initial = { step: "DORMANT", context: {} };
const active = { step: "BOOK_REASON", context: { serviceId: "s" } };
const row = { patientJid: jid, ...active, updatedAt: new Date("2026-11-20T12:00:00Z") };
const insertedAt = new Date("2026-11-20T12:05:00Z");
const state = db.conversationState;

beforeEach(() => {
  vi.resetAllMocks();
  db.agenda.findUnique.mockResolvedValue({ professional: { timezone: "UTC", phoneJid: null } });
});

const expiredText = {
  step: { in: ["AWAIT_QUESTION", "BOOK_REASON", "BOOK_CONFIRM"] },
  updatedAt: { lt: insertedAt },
};

it("selects only tenants with expired text, regardless of absent or stopped WhatsApp intent", async () => {
  db.tenant.findMany.mockResolvedValue([{ id: "no-status" }, { id: "stopped" }]);
  await expect(listTenantsWithExpiredConversationText(insertedAt)).resolves.toEqual([
    { tenantId: "no-status" }, { tenantId: "stopped" },
  ]);
  expect(db.tenant.findMany.mock.calls).toEqual([[{
    where: { conversationStates: { some: expiredText } }, select: { id: true },
  }]]);
});

it("resets only the specified tenant's expired text, including first-contact sessions", async () => {
  state.updateMany.mockResolvedValue({ count: 3 });
  await expect(clearExpiredConversationText({ tenantId: "stopped" }, insertedAt)).resolves.toBe(3);
  expect(state.updateMany.mock.calls).toEqual([[{
    where: { tenantId: "stopped", ...expiredText }, data: initial,
  }]]);
  expect(db.agenda.findUnique).not.toHaveBeenCalled();
  expect(db.patient.findMany).not.toHaveBeenCalled();
});

it("reads only scoped timestamps for requested JIDs belonging to active original patients", async () => {
  const requested = [jid, "foreign@lid", "archived@lid", "unknown@lid"];
  db.patient.findMany.mockResolvedValue([{ whatsappJid: jid }]);
  const contacts = [{ patientJid: jid, updatedAt: row.updatedAt }];
  state.findMany.mockResolvedValue(contacts);

  await expect(listPatientLastContacts(owner, requested)).resolves.toEqual(contacts);
  expect(db.patient.findMany.mock.calls).toEqual([[{
    where: { tenantId, archivedAt: null, whatsappJid: { in: requested } },
    select: { whatsappJid: true },
  }]]);
  expect(state.findMany.mock.calls).toEqual([[{
    where: { patientJid: { in: [jid] }, ...owner }, select: { patientJid: true, updatedAt: true },
  }]]);
});

it("does not read conversation state if no requested patient is eligible", async () => {
  db.patient.findMany.mockResolvedValue([]);
  await expect(listPatientLastContacts(owner, [])).resolves.toEqual([]);
  expect(db.patient.findMany).not.toHaveBeenCalled();
  await expect(listPatientLastContacts(owner, ["foreign@lid"])).resolves.toEqual([]);
  expect(state.findMany).not.toHaveBeenCalled();
});

it.each([
  ["read", () => findLegacyConversationState(jid)],
  ["initialize", () => loadOrInitializeLegacyConversationState(jid, initial.step)],
  ["save", () => saveLegacyConversationState(jid, active.step, active.context)],
  ["purge", () => clearExpiredLegacyConversationText(insertedAt)],
] as const)("refuses to %s without the original installation", async (_name, operation) => {
  db.agenda.findUnique.mockResolvedValue(null);
  await expect(operation()).rejects.toThrow("No se pudo verificar la agenda de la instalación original.");
  expect(db.patient.findMany).not.toHaveBeenCalled();
  for (const method of Object.values(state)) expect(method).not.toHaveBeenCalled();
});

it("preserves an existing owned state and timestamp on initialize; save never restamps ownership", async () => {
  const existing = { ...row, tenantId };
  state.findUnique.mockResolvedValue(existing);
  state.createMany.mockResolvedValue({ count: 0 });
  state.updateMany.mockResolvedValue({ count: 1 });
  await expect(findLegacyConversationState(jid)).resolves.toEqual(existing);
  await expect(loadOrInitializeLegacyConversationState(jid, initial.step)).resolves.toEqual(existing);
  expect(state.createMany).not.toHaveBeenCalled();
  expect(state.updateMany).not.toHaveBeenCalled();
  await expect(saveLegacyConversationState(jid, initial.step, initial.context)).resolves.toBeUndefined();
  expect(state.findUnique.mock.calls).toEqual([[{ where: key }], [{ where: key }]]);
  expect(state.updateMany.mock.calls).toEqual([[{ where: { patientJid: jid, ...owner }, data: initial }]]);
});

it.each([1, 0])("initializes first contact without a Patient and returns the stored timestamp (insert count %s)", async (count) => {
  const stored = count ? { patientJid: jid, tenantId, ...initial, updatedAt: insertedAt } : { ...row, tenantId };
  state.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(stored);
  state.createMany.mockResolvedValue({ count });
  await expect(loadOrInitializeLegacyConversationState(jid, initial.step)).resolves.toEqual(stored);
  expect(state.createMany.mock.calls).toEqual([[{ data: { patientJid: jid, tenantId, ...initial }, skipDuplicates: true }]]);
  expect(state.findUnique.mock.calls).toEqual([[{ where: key }], [{ where: key }]]);
  expect(db.patient.findMany).not.toHaveBeenCalled();
  expect(state.updateMany).not.toHaveBeenCalled();
});

it("stamps a new direct save and does not update it again", async () => {
  state.createMany.mockResolvedValue({ count: 1 });
  await expect(saveLegacyConversationState(jid, active.step, active.context)).resolves.toBeUndefined();
  expect(state.createMany.mock.calls).toEqual([[{ data: { patientJid: jid, tenantId, ...active }, skipDuplicates: true }]]);
  expect(state.updateMany).not.toHaveBeenCalled();
});

it("initializes and saves an owned session beside inactive and foreign sessions without touching them", async () => {
  const historical = { ...row, tenantId: null };
  const foreign = { ...row, tenantId: "other" };
  const rows: Array<typeof row & { tenantId: string | null }> = [historical, foreign].map((record) => ({ ...record }));
  state.findUnique.mockImplementation(async ({ where }) => {
    const selector = where.tenantId_patientJid ?? where;
    return rows.find((record) => record.patientJid === selector.patientJid &&
      (where.OR ? where.OR.some((owner: { tenantId: string | null }) => owner.tenantId === record.tenantId) :
        record.tenantId === selector.tenantId)) ?? null;
  });
  state.createMany.mockImplementation(async ({ data }) => {
    if (rows.some((record) => record.patientJid === data.patientJid && record.tenantId === data.tenantId)) return { count: 0 };
    rows.push({ ...data, updatedAt: insertedAt });
    return { count: 1 };
  });
  state.updateMany.mockImplementation(async ({ where, data }) => {
    const record = rows.find((record) => record.patientJid === where.patientJid && record.tenantId === where.tenantId);
    if (!record) return { count: 0 };
    Object.assign(record, data);
    return { count: 1 };
  });
  await expect(findLegacyConversationState(jid)).resolves.toBeNull();
  await expect(loadOrInitializeLegacyConversationState(jid, initial.step)).resolves.toEqual({
    patientJid: jid, tenantId, ...initial, updatedAt: insertedAt,
  });
  await expect(saveLegacyConversationState(jid, active.step, active.context)).resolves.toBeUndefined();
  expect(rows).toEqual([historical, foreign, { ...row, tenantId, updatedAt: insertedAt }]);
});
