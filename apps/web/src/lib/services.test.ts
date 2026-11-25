import { beforeEach, describe, expect, it, vi } from "vitest";
import { createService, listServices, setServiceActive, updateService } from "./services";

const db = vi.hoisted(() => ({
  agenda: { findUnique: vi.fn() },
  service: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@nutri-bot/db", () => ({ prisma: db, Prisma: { Decimal: function Decimal(value: number) { return { value }; } } }));

const T = { tenantId: "legacy-tenant" };
const data = { name: "Control", price: 25, durationMin: 30, color: "blue", requiresDeposit: false, asksReason: false };
const orderBy = [{ active: "desc" }, { name: "asc" }];

beforeEach(() => {
  vi.resetAllMocks();
});

describe("legacy services", () => {
  it("lists only the original tenant with the previous ordering and optional active filter", async () => {
    const rows = [{ name: "Control" }];
    db.service.findMany.mockResolvedValue(rows);
    await expect(listServices(T)).resolves.toBe(rows);
    await expect(listServices(T, { activeOnly: true })).resolves.toBe(rows);
    expect(db.service.findMany.mock.calls).toEqual([
      [{ where: { tenantId: "legacy-tenant" }, orderBy }],
      [{ where: { tenantId: "legacy-tenant", active: true }, orderBy }],
    ]);
  });

  it("creates a bookable legacy service, not a service for a caller-supplied tenant", async () => {
    const row = { id: "new" };
    const submitted = { ...data, tenantId: "other", depositValue: 0 };
    db.service.create.mockResolvedValue(row);
    await expect(createService(T, submitted)).resolves.toBe(row);
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
    await expect(updateService(T, "own", submitted)).resolves.toBe(row);
    await expect(setServiceActive(T, "own", false)).resolves.toBe(row);
    expect(db.service.update.mock.calls.slice(0, 2)).toEqual([
      [{ where: { id: "own", tenantId: "legacy-tenant" }, data: { ...data, price: { value: 25 }, depositValue: null, reminders: undefined } }],
      [{ where: { id: "own", tenantId: "legacy-tenant" }, data: { active: false } }],
    ]);
    await expect(updateService(T, "other", data)).rejects.toMatchObject({ code: "P2025" });
    await expect(setServiceActive(T, "other", false)).rejects.toMatchObject({ code: "P2025" });
  });

  it("HU-025: usa el tenant del contexto (t) aunque los datos traigan otro", async () => {
    const B = { tenantId: "tenant-b" };
    db.service.findMany.mockResolvedValue([]);
    db.service.create.mockResolvedValue({});
    db.service.update.mockResolvedValue({});
    await listServices(B);
    await createService(B, { ...data, tenantId: "legacy-tenant" } as typeof data);
    await updateService(B, "own", data);
    await setServiceActive(B, "own", true);
    expect(db.service.findMany.mock.calls[0]![0].where).toEqual({ tenantId: "tenant-b" });
    expect(db.service.create.mock.calls[0]![0].data.tenantId).toBe("tenant-b");
    expect(db.service.update.mock.calls.map((c) => c[0].where)).toEqual([
      { id: "own", tenantId: "tenant-b" }, { id: "own", tenantId: "tenant-b" },
    ]);
    expect(db.agenda.findUnique).not.toHaveBeenCalled();
  });
});
