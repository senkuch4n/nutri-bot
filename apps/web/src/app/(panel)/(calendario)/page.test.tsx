import { beforeEach, expect, it, vi } from "vitest";
import CalendarPage from "./page";

const { db, resolveScope, listServices } = vi.hoisted(() => ({
  db: {
    professional: { findUniqueOrThrow: vi.fn() },
    availabilityRule: { findMany: vi.fn() },
  },
  resolveScope: vi.fn(),
  listServices: vi.fn(),
}));
vi.mock("@nutri-bot/db", () => ({ prisma: db }));
vi.mock("@nutri-bot/db/domain/legacySchedulingScope", () => ({ resolveLegacySchedulingScope: resolveScope }));
vi.mock("@/lib/professional", () => ({ getProfessional: async () => ({ timezone: "UTC", currency: "ARS" }) }));
vi.mock("@/lib/services", () => ({ listServices }));
vi.mock("../calendar-client", () => ({ CalendarClient: () => null }));

beforeEach(() => {
  vi.resetAllMocks();
  resolveScope.mockResolvedValue({
    scope: { agendaId: "legacy-agenda", tenantId: "legacy-tenant" },
    professional: { timezone: "UTC" },
  });
  db.professional.findUniqueOrThrow.mockResolvedValue({ currency: "ARS" });
  listServices.mockResolvedValue([{ id: "service", name: "Consulta", durationMin: 30, color: "#2563eb" }]);
  db.availabilityRule.findMany.mockResolvedValue([{ weekday: 1, startTime: "09:30", endTime: "18:15" }]);
});

it("reads only original-agenda hours and preserves calendar props", async () => {
  const page = await CalendarPage();
  expect(db.availabilityRule.findMany.mock.calls).toEqual([[{
    where: { agendaId: "legacy-agenda", agenda: { tenantId: "legacy-tenant" }, active: true },
  }]]);
  expect(db.professional.findUniqueOrThrow.mock.calls).toEqual([[{
    where: { id_tenantId: { id: 1, tenantId: "legacy-tenant" } }, select: { currency: true },
  }]]);
  expect(listServices.mock.calls).toEqual([[{ activeOnly: true }]]);
  expect(page.props).toMatchObject({
    tz: "UTC", currency: "ARS",
    services: [{ id: "service", name: "Consulta", durationMin: 30 }],
    legend: [{ name: "Consulta", color: "#2563eb" }],
    businessHours: [{ daysOfWeek: [1], startTime: "09:30", endTime: "18:15" }],
    slotMin: "08:00:00", slotMax: "20:00:00",
  });
});

it("does not read hours or services when the original agenda cannot be verified", async () => {
  const message = "No se pudo verificar la agenda de la instalación original.";
  resolveScope.mockRejectedValue(new Error(message));
  await expect(CalendarPage()).rejects.toThrow(message);
  expect(db.availabilityRule.findMany).not.toHaveBeenCalled();
  expect(db.professional.findUniqueOrThrow).not.toHaveBeenCalled();
  expect(listServices).not.toHaveBeenCalled();
});
