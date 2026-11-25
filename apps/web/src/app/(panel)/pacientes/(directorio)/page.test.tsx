import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const mocks = vi.hoisted(() => ({
  patient: vi.fn(), legacyState: vi.fn(), lastContacts: vi.fn(), scope: vi.fn(), professional: vi.fn(),
}));
vi.mock("@nutri-bot/db", () => ({ prisma: {
  patient: { findMany: mocks.patient }, conversationState: { findMany: mocks.legacyState },
} }));
vi.mock("@/lib/tenant-context", () => ({ requirePageContext: mocks.scope }));
vi.mock("@nutri-bot/db/domain", () => ({ getTenantProfessional: mocks.professional }));
vi.mock("@nutri-bot/db/domain/conversationState", () => ({ listPatientLastContacts: mocks.lastContacts }));
vi.mock("@/components/ui", () => ({ PageHeader: () => null }));
vi.mock("../new-patient-dialog", () => ({ NewPatientDialog: () => null }));
vi.mock("../archived-patient-list", () => ({ ArchivedPatientList: () => null }));
vi.mock("../patient-directory", () => ({ PatientDirectory: () => null }));

import PacientesPage from "./page";

const scope = { tenantId: "legacy-tenant", agendaId: "legacy-agenda" };
const original = { id: "original", name: "Ada", phone: "123", whatsappJid: "123@s.whatsapp.net" };
const foreign = { id: "foreign", name: "Foreign", phone: "456", whatsappJid: "456@s.whatsapp.net" };
const today = new Date();
const active = { ...original, createdAt: today, archivedAt: null, appointments: [], consultations: [] };
const archived = { ...original, id: "archived", archivedAt: today };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.scope.mockResolvedValue({ userId: "u", ...scope, professionalId: 1 });
  mocks.professional.mockResolvedValue({ timezone: "UTC" });
  mocks.patient.mockImplementation(async ({ where }) => {
    const rows = where.archivedAt === null ? [active] : [archived];
    return where.tenantId === scope.tenantId ? rows : [...rows, { ...rows[0], ...foreign }];
  });
  mocks.lastContacts.mockResolvedValue([{ patientJid: original.whatsappJid, updatedAt: today }]);
  mocks.legacyState.mockResolvedValue([]);
});

it("loads the original directory and asks the adapter for only the listed active JIDs", async () => {
  const view = await PacientesPage({ searchParams: Promise.resolve({}) });
  expect(view.props.named).toEqual([expect.objectContaining({ id: original.id, statusLine: expect.stringContaining("Te escribió") })]);
  expect(view.props.archivedCount).toBe(1);
  expect(mocks.lastContacts.mock.calls).toEqual([[expect.objectContaining({ tenantId: scope.tenantId }), [original.whatsappJid]]]);
  expect(mocks.legacyState).not.toHaveBeenCalled();
  expect(mocks.patient).toHaveBeenCalledWith(expect.objectContaining({
    where: { tenantId: scope.tenantId, archivedAt: null },
    select: expect.objectContaining({
      appointments: expect.objectContaining({ where: {
        ...scope, status: { in: ["CONFIRMED", "AWAITING_PAYMENT"] }, startsAt: { gte: expect.any(Date) },
      }, orderBy: { startsAt: "asc" }, take: 1 }),
      consultations: expect.objectContaining({ where: { tenantId: scope.tenantId }, orderBy: { consultedAt: "desc" }, take: 1 }),
    }),
  }));
});

it("preserves upcoming deposit and last consultation details for original patients", async () => {
  const startsAt = new Date(today.getTime() + 86_400_000);
  mocks.patient.mockResolvedValueOnce([
    { ...active, appointments: [{ startsAt, status: "AWAITING_PAYMENT" }] },
    { ...active, id: "consulted", name: "Bea", whatsappJid: "789@s.whatsapp.net", consultations: [{ consultedAt: today }] },
  ]);
  const view = await PacientesPage({ searchParams: Promise.resolve({}) });
  expect(view.props.named).toEqual([
    expect.objectContaining({ id: original.id, statusLine: expect.stringContaining("Falta la seña") }),
    expect.objectContaining({ id: "consulted", statusLine: expect.stringContaining("Última consulta") }),
  ]);
});

it("preserves the archived view without reading conversation state", async () => {
  const view = await PacientesPage({ searchParams: Promise.resolve({ vista: "archivadas" }) });
  const [, list] = view.props.children as ReactElement<{ rows: unknown[] }>[];
  expect(list?.props.rows).toEqual([expect.objectContaining({ id: archived.id })]);
  expect(mocks.patient).toHaveBeenCalledTimes(1);
  expect(mocks.patient).toHaveBeenCalledWith(expect.objectContaining({
    where: { tenantId: scope.tenantId, archivedAt: { not: null } },
  }));
  expect(mocks.legacyState).not.toHaveBeenCalled();
  expect(mocks.lastContacts).not.toHaveBeenCalled();
});

it.each([undefined, "archivadas"])("fails closed without a tenant context (%s)", async (vista) => {
  mocks.scope.mockRejectedValue(new Error("NEXT_REDIRECT"));
  await expect(PacientesPage({ searchParams: Promise.resolve({ vista }) }))
    .rejects.toThrow("NEXT_REDIRECT");
  expect(mocks.patient).not.toHaveBeenCalled();
  expect(mocks.legacyState).not.toHaveBeenCalled();
  expect(mocks.lastContacts).not.toHaveBeenCalled();
});

it("HU-025: con el contexto de otro consultorio lista solo sus pacientes", async () => {
  mocks.scope.mockResolvedValue({ userId: "u", tenantId: "tenant-b", agendaId: "agenda-b", professionalId: 7 });
  mocks.patient.mockResolvedValue([]);
  await PacientesPage({ searchParams: Promise.resolve({}) });
  for (const [args] of mocks.patient.mock.calls) expect(args.where.tenantId).toBe("tenant-b");
  expect(mocks.professional).toHaveBeenCalledWith("tenant-b");
});
