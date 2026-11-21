import { beforeEach, describe, expect, it, vi } from "vitest";
import { createService, listServices, setServiceActive, updateService } from "./services";

const db = vi.hoisted(() => ({
  agenda: { findUnique: vi.fn() },
  service: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@nutri-bot/db", () => ({ prisma: db, Prisma: { Decimal: function Decimal(value: number) { return { value }; } } }));

const data = { name: "Control", price: 25, durationMin: 30, color: "blue", requiresDeposit: false, asksReason: false };
const orderBy = [{ active: "desc" }, { name: "asc" }];

beforeEach(() => {
  vi.resetAllMocks();
  db.agenda.findUnique.mockResolvedValue({ professional: { timezone: "UTC", phoneJid: null } });
});

describe("legacy services", () => {
  it("lists only the original tenant with the previous ordering and optional active filter", async () => {
    const rows = [{ name: "Control" }];
    db.service.findMany.mockResolvedValue(rows);
    await expect(listServices()).resolves.toBe(rows);
    await expect(listServices({ activeOnly: true })).resolves.toBe(rows);
    expect(db.service.findMany.mock.calls).toEqual([
      [{ where: { tenantId: "legacy-tenant" }, orderBy }],
      [{ where: { tenantId: "legacy-tenant", active: true }, orderBy }],
    ]);
  });

  it("creates a bookable legacy service, not a service for a caller-supplied tenant", async () => {
    const row = { id: "new" };
    const submitted = { ...data, tenantId: "other", depositValue: 0 };
    db.service.create.mockResolvedValue(row);
    await expect(createService(submitted)).resolves.toBe(row);
    expect(db.service.create).toHaveBeenCalledWith({ data: {
      ...data, tenantId: "legacy-tenant", price: { value: 25 }, depositValue: { value: 0 }, reminders: undefined,
    } });
  });

  it("edits and toggles only owned services without replacing ownership", async () => {
    const row = { id: "own" };
    db.service.update.mockImplementation(async ({ where }) => {
      if (where.id === "other" && where.tenantId === "legacy-tenant") throw Object.assign(new Error("not found"), { code: "P2025" });
      return row;
    });
    const submitted = { ...data, tenantId: "other" };
    await expect(updateService("own", submitted)).resolves.toBe(row);
    await expect(setServiceActive("own", false)).resolves.toBe(row);
    expect(db.service.update.mock.calls.slice(0, 2)).toEqual([
      [{ where: { id: "own", tenantId: "legacy-tenant" }, data: { ...data, price: { value: 25 }, depositValue: null, reminders: undefined } }],
      [{ where: { id: "own", tenantId: "legacy-tenant" }, data: { active: false } }],
    ]);
    await expect(updateService("other", data)).rejects.toMatchObject({ code: "P2025" });
    await expect(setServiceActive("other", false)).rejects.toMatchObject({ code: "P2025" });
  });

  it.each([
    ["list", () => listServices()], ["create", () => createService(data)],
    ["update", () => updateService("own", data)], ["toggle", () => setServiceActive("own", false)],
  ] as const)("fails closed on %s without a verified original agenda", async (_label, call) => {
    db.agenda.findUnique.mockResolvedValue(null);
    await expect(call()).rejects.toThrow("No se pudo verificar la agenda de la instalación original.");
    expect(db.agenda.findUnique).toHaveBeenCalledWith({
      where: { id_tenantId: { id: "legacy-agenda", tenantId: "legacy-tenant" }, isPrimary: true, professionalId: 1 },
      select: { professional: { select: { timezone: true, phoneJid: true } } },
    });
    for (const mock of Object.values(db.service)) expect(mock).not.toHaveBeenCalled();
  });
});
