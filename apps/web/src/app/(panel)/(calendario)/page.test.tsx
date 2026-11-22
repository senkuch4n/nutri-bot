import { beforeEach, expect, it, vi } from "vitest";
import CalendarPage from "./page";

const { db, requirePageContext, getTenantProfessional, listServices } = vi.hoisted(() => ({
  db: {
    availabilityRule: { findMany: vi.fn() },
  },
  requirePageContext: vi.fn(),
  getTenantProfessional: vi.fn(),
  listServices: vi.fn(),
}));
vi.mock("@nutri-bot/db", () => ({ prisma: db }));
vi.mock("@/lib/tenant-context", () => ({ requirePageContext }));
vi.mock("@nutri-bot/db/domain", () => ({ getTenantProfessional }));
vi.mock("@/lib/services", () => ({ listServices }));
vi.mock("../calendar-client", () => ({ CalendarClient: () => null }));

const ctx = { userId: "u", tenantId: "legacy-tenant", agendaId: "legacy-agenda", professionalId: 1 };

beforeEach(() => {
  vi.resetAllMocks();
  requirePageContext.mockResolvedValue(ctx);
  getTenantProfessional.mockResolvedValue({ timezone: "UTC", currency: "ARS" });
  listServices.mockResolvedValue([{ id: "service", name: "Consulta", durationMin: 30, color: "#2563eb" }]);
  db.availabilityRule.findMany.mockResolvedValue([{ weekday: 1, startTime: "09:30", endTime: "18:15" }]);
});

it("reads only the session agenda's hours and preserves calendar props", async () => {
  const page = await CalendarPage();
  expect(db.availabilityRule.findMany.mock.calls).toEqual([[{
    where: { agendaId: "legacy-agenda", agenda: { tenantId: "legacy-tenant" }, active: true },
  }]]);
  expect(getTenantProfessional.mock.calls).toEqual([["legacy-tenant"]]);
  expect(listServices.mock.calls).toEqual([[ctx, { activeOnly: true }]]);
  expect(page.props).toMatchObject({
    tz: "UTC", currency: "ARS",
    services: [{ id: "service", name: "Consulta", durationMin: 30 }],
    legend: [{ name: "Consulta", color: "#2563eb" }],
    businessHours: [{ daysOfWeek: [1], startTime: "09:30", endTime: "18:15" }],
    slotMin: "08:00:00", slotMax: "20:00:00",
  });
});

it("HU-025: con el contexto de otro consultorio lee su agenda y su profesional", async () => {
  requirePageContext.mockResolvedValue({ ...ctx, tenantId: "tenant-b", agendaId: "agenda-b" });
  await CalendarPage();
  expect(db.availabilityRule.findMany.mock.calls[0]![0].where).toEqual({ agendaId: "agenda-b", agenda: { tenantId: "tenant-b" }, active: true });
  expect(getTenantProfessional).toHaveBeenCalledWith("tenant-b");
});

it("does not read hours or services without a tenant context", async () => {
  requirePageContext.mockRejectedValue(new Error("NEXT_REDIRECT"));
  await expect(CalendarPage()).rejects.toThrow("NEXT_REDIRECT");
  expect(db.availabilityRule.findMany).not.toHaveBeenCalled();
  expect(getTenantProfessional).not.toHaveBeenCalled();
  expect(listServices).not.toHaveBeenCalled();
});
