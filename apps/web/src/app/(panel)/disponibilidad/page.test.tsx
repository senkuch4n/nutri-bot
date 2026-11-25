import { beforeEach, expect, it, vi } from "vitest";
import DisponibilidadPage from "./page";

const db = vi.hoisted(() => ({
  availabilityRule: { findMany: vi.fn() },
  availabilityException: { findMany: vi.fn() },
}));
const { requirePageContext, getTenantProfessional } = vi.hoisted(() => ({
  requirePageContext: vi.fn(),
  getTenantProfessional: vi.fn(),
}));
vi.mock("@nutri-bot/db", () => ({ prisma: db }));
vi.mock("@/lib/tenant-context", () => ({ requirePageContext }));
vi.mock("@nutri-bot/db/domain", () => ({ getTenantProfessional }));
vi.mock("./view", () => ({ DisponibilidadView: () => null }));

beforeEach(() => {
  vi.resetAllMocks();
});

it("reads only the session agenda's rules and exceptions and preserves their view shape", async () => {
  requirePageContext.mockResolvedValue({ userId: "u", tenantId: "legacy-tenant", agendaId: "legacy-agenda", professionalId: 1 });
  getTenantProfessional.mockResolvedValue({ timezone: "UTC" });
  const rules = [{ id: "rule", weekday: 1, startTime: "09:00", endTime: "13:00" }];
  const exception = { id: "exception", type: "BLOCK", startTime: null, endTime: null, reason: "Feriado" };
  db.availabilityRule.findMany.mockResolvedValue(rules);
  db.availabilityException.findMany.mockResolvedValue([{ ...exception, date: new Date("2026-11-23") }]);

  const page = await DisponibilidadPage();
  const where = { agendaId: "legacy-agenda", agenda: { tenantId: "legacy-tenant" } };
  expect(db.availabilityRule.findMany.mock.calls).toEqual([[{
    where: { ...where, active: true },
    orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    select: { id: true, weekday: true, startTime: true, endTime: true },
  }]]);
  expect(db.availabilityException.findMany.mock.calls).toEqual([[{ where, orderBy: { date: "asc" } }]]);
  expect(page.props).toMatchObject({ rules, exceptions: [{ ...exception, dayKey: "2026-11-23" }] });
});

it("HU-025: otro consultorio en el contexto → solo su agenda", async () => {
  requirePageContext.mockResolvedValue({ userId: "u", tenantId: "tenant-b", agendaId: "agenda-b", professionalId: 7 });
  getTenantProfessional.mockResolvedValue({ timezone: "UTC" });
  db.availabilityRule.findMany.mockResolvedValue([]);
  db.availabilityException.findMany.mockResolvedValue([]);
  await DisponibilidadPage();
  expect(getTenantProfessional).toHaveBeenCalledWith("tenant-b");
  expect(db.availabilityRule.findMany.mock.calls[0]![0].where).toEqual({ agendaId: "agenda-b", agenda: { tenantId: "tenant-b" }, active: true });
});

it("does not issue schedule reads without a tenant context (redirect a /inicio)", async () => {
  requirePageContext.mockRejectedValue(new Error("NEXT_REDIRECT"));
  await expect(DisponibilidadPage()).rejects.toThrow("NEXT_REDIRECT");
  expect(db.availabilityRule.findMany).not.toHaveBeenCalled();
  expect(db.availabilityException.findMany).not.toHaveBeenCalled();
});
