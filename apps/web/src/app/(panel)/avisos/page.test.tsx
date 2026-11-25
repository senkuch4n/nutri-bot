import { beforeEach, expect, it, vi } from "vitest";
import AvisosPage from "./page";

const { db, resolveScope, professional } = vi.hoisted(() => ({
  db: {
    patient: { findMany: vi.fn() },
    outboundMessage: { findMany: vi.fn(), groupBy: vi.fn() },
  },
  resolveScope: vi.fn(),
  professional: vi.fn(),
}));
vi.mock("@nutri-bot/db", () => ({ prisma: db }));
vi.mock("@/lib/tenant-context", () => ({ requirePageContext: resolveScope }));
vi.mock("@nutri-bot/db/domain", () => ({ getTenantProfessional: professional }));
vi.mock("@/components/ui", () => ({ PageHeader: () => null }));
vi.mock("./avisos-view", () => ({ AvisosView: () => null }));
vi.mock("./broadcast-form", () => ({ BroadcastForm: () => null }));

beforeEach(() => {
  vi.resetAllMocks();
  resolveScope.mockResolvedValue({ userId: "u", tenantId: "legacy-tenant", agendaId: "legacy-agenda", professionalId: 1 });
  professional.mockResolvedValue({ timezone: "UTC", phoneJid: null });
});

it("scopes message rows and totals together and resolves names only among original patients", async () => {
  const toJid = "5493515552345@s.whatsapp.net";
  const tenantId = "legacy-tenant";
  db.outboundMessage.findMany.mockResolvedValue([
    { id: "legacy", toJid, status: "SENT", kind: "REMINDER", body: "Recordatorio", lastError: null, createdAt: new Date() },
  ]);
  db.outboundMessage.groupBy.mockResolvedValue([{ status: "SENT", _count: { _all: 1 } }]);
  db.patient.findMany.mockResolvedValueOnce([{ whatsappJid: toJid, archivedAt: null }]);
  db.patient.findMany.mockResolvedValueOnce([{ whatsappJid: toJid, name: "Paciente original" }]);

  const page = await AvisosPage();
  const where = { OR: [
    { tenantId },
    { tenantId: null, AND: [
      { OR: [{ appointment: { tenantId } }, { plan: { tenantId } }, { anthropometricReport: { tenantId } }] },
      { OR: [{ appointmentId: null }, { appointment: { tenantId } }] },
      { OR: [{ planId: null }, { plan: { tenantId } }] },
      { OR: [{ anthropometricReportId: null }, { anthropometricReport: { tenantId } }] },
    ] },
  ] };
  expect(db.outboundMessage.findMany.mock.calls).toEqual([[{ where, orderBy: { createdAt: "desc" }, take: 100 }]]);
  expect(db.outboundMessage.groupBy.mock.calls).toEqual([[{ where, by: ["status"], _count: { _all: true } }]]);
  expect(db.patient.findMany.mock.calls.map(([args]) => args.where)).toEqual([
    { tenantId, archivedAt: null }, { tenantId, whatsappJid: { in: [toJid] } },
  ]);
  expect(page.props.children[1].props.children[1].props.patientCount).toBe(1);
  expect(page.props.children[2].props).toMatchObject({
    rows: [{ id: "legacy", to: "Paciente original" }], counts: { PENDING: 0, SENT: 1, FAILED: 0 }, intervalSeconds: 8,
  });
});

it("does not query messages or patients if the legacy scope cannot be resolved", async () => {
  resolveScope.mockRejectedValue(new Error("missing scope"));
  db.outboundMessage.findMany.mockResolvedValue([]);
  db.outboundMessage.groupBy.mockResolvedValue([]);
  db.patient.findMany.mockResolvedValue([]);
  await expect(AvisosPage()).rejects.toThrow("missing scope");
  expect(db.outboundMessage.findMany).not.toHaveBeenCalled();
  expect(db.outboundMessage.groupBy).not.toHaveBeenCalled();
  expect(db.patient.findMany).not.toHaveBeenCalled();
});
