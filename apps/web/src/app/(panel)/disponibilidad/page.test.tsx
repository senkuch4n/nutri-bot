import { beforeEach, expect, it, vi } from "vitest";
import DisponibilidadPage from "./page";

const db = vi.hoisted(() => ({
  availabilityRule: { findMany: vi.fn() },
  availabilityException: { findMany: vi.fn() },
}));
const resolveScope = vi.hoisted(() => vi.fn());
vi.mock("@nutri-bot/db", () => ({ prisma: db }));
vi.mock("@nutri-bot/db/domain/legacySchedulingScope", () => ({ resolveLegacySchedulingScope: resolveScope }));
vi.mock("@/lib/professional", () => ({ getProfessional: async () => ({ timezone: "UTC" }) }));
vi.mock("./view", () => ({ DisponibilidadView: () => null }));

beforeEach(() => {
  vi.resetAllMocks();
});

it("reads only original-agenda rules and exceptions and preserves their view shape", async () => {
  resolveScope.mockResolvedValue({
    scope: { tenantId: "legacy-tenant", agendaId: "legacy-agenda" },
    professional: { timezone: "UTC" },
  });
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

it("does not issue schedule reads when the original agenda cannot be verified", async () => {
  resolveScope.mockRejectedValue(new Error("No se pudo verificar la agenda de la instalación original."));
  await expect(DisponibilidadPage()).rejects.toThrow("No se pudo verificar la agenda de la instalación original.");
  expect(db.availabilityRule.findMany).not.toHaveBeenCalled();
  expect(db.availabilityException.findMany).not.toHaveBeenCalled();
});
