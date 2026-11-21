import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agenda: { findUnique: vi.fn() },
  appointment: { findMany: vi.fn(), update: vi.fn() },
  professional: { update: vi.fn() },
  getProfessional: vi.fn(),
  credentials: vi.fn(),
  calendar: vi.fn(),
  insert: vi.fn(),
  patch: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock("../index", () => ({ prisma: mocks }));
vi.mock("./availability", () => ({ getProfessional: mocks.getProfessional }));
vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: class { setCredentials = mocks.credentials; } },
    calendar: mocks.calendar,
  },
}));

import { syncGoogleCalendar } from "./gcal";

const scope = { tenantId: "legacy-tenant", agendaId: "legacy-agenda" };
const agendaOwner = { professionalId: 1, isPrimary: true };
const apptScope = { ...scope, agenda: agendaOwner };
const proScope = {
  id: 1,
  tenantId: scope.tenantId,
  agendas: { some: { id: scope.agendaId, tenantId: scope.tenantId, ...agendaOwner } },
};
const pro = {
  id: 1,
  timezone: "America/Argentina/Buenos_Aires",
  googleRefreshToken: "original-token",
  googleCalendarId: "original-calendar",
  googleSyncError: "old error",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.agenda.findUnique.mockImplementation(async ({ where }) =>
    where.id_tenantId?.id === scope.agendaId && where.id_tenantId?.tenantId === scope.tenantId &&
    where.professionalId === 1 && where.isPrimary === true ? { professional: pro } : null,
  );
  mocks.getProfessional.mockResolvedValue({ ...pro, googleRefreshToken: "unverified-token" });
  mocks.appointment.findMany.mockResolvedValue([]);
  mocks.calendar.mockReturnValue({ events: { insert: mocks.insert, patch: mocks.patch, delete: mocks.deleteEvent } });
});

function expectNoWork() {
  expect(mocks.credentials).not.toHaveBeenCalled();
  expect(mocks.calendar).not.toHaveBeenCalled();
  expect(mocks.appointment.update).not.toHaveBeenCalled();
  expect(mocks.professional.update).not.toHaveBeenCalled();
}

describe("Google Calendar worker: instalación original", () => {
  it.each(["missing", "wrong professional", "non-primary", "wrong tenant"])(
    "fails closed for an unverifiable original agenda (%s)", async (reason) => {
      const agenda = { id: scope.agendaId, tenantId: scope.tenantId, ...agendaOwner, professional: pro };
      if (reason === "wrong professional") agenda.professionalId = 2;
      if (reason === "non-primary") agenda.isPrimary = false;
      if (reason === "wrong tenant") agenda.tenantId = "other-tenant";
      mocks.agenda.findUnique.mockImplementation(async ({ where }) =>
        reason !== "missing" && where.id_tenantId?.id === agenda.id &&
        where.id_tenantId?.tenantId === agenda.tenantId && where.professionalId === agenda.professionalId &&
        where.isPrimary === agenda.isPrimary ? agenda : null,
      );
      await expect(syncGoogleCalendar()).rejects.toThrow("No se pudo verificar la agenda de la instalación original.");
      expect(mocks.appointment.findMany).not.toHaveBeenCalled();
      expect(mocks.getProfessional).not.toHaveBeenCalled();
      expectNoWork();
    },
  );

  it("does not borrow a token when the verified professional has no token", async () => {
    mocks.agenda.findUnique.mockResolvedValue({ professional: { ...pro, googleRefreshToken: null } });
    await expect(syncGoogleCalendar()).resolves.toEqual({ processed: 0 });
    expect(mocks.getProfessional).not.toHaveBeenCalled();
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
    expectNoWork();
  });

  it("preserves the empty queue without starting Google or clearing an error", async () => {
    await expect(syncGoogleCalendar()).resolves.toEqual({ processed: 0 });
    expect(mocks.appointment.findMany).toHaveBeenCalledOnce();
    expectNoWork();
  });

  it("does not select other tenants, other agendas, or unowned rows; scopes all writes", async () => {
    const rows = [
      { ...scope, id: "foreign-tenant", tenantId: "other-tenant" },
      { ...scope, id: "foreign-agenda", agendaId: "other-agenda" },
      { id: "unowned", tenantId: null, agendaId: null },
      { ...scope, id: "cancelled", status: "CANCELLED", googleEventId: "original-event" },
      { ...scope, id: "no-event", status: "AWAITING_PAYMENT", googleEventId: null },
    ];
    mocks.appointment.findMany.mockImplementation(async ({ where }) => rows.filter(
      (row) => (!where.tenantId || row.tenantId === where.tenantId) &&
        (!where.agendaId || row.agendaId === where.agendaId),
    ));
    mocks.deleteEvent.mockRejectedValue({ code: 410 });
    await expect(syncGoogleCalendar()).resolves.toEqual({ processed: 2 });
    expect(mocks.appointment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ...apptScope, needsGoogleSync: true }, orderBy: { updatedAt: "asc" }, take: 25,
    }));
    expect(mocks.credentials.mock.calls).toEqual([[{ refresh_token: "original-token" }]]);
    expect(mocks.deleteEvent.mock.calls).toEqual([[{ calendarId: "original-calendar", eventId: "original-event" }]]);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.appointment.update.mock.calls).toEqual([
      [{ where: { ...apptScope, id: "cancelled" }, data: { needsGoogleSync: false, googleEventId: null } }],
      [{ where: { ...apptScope, id: "no-event" }, data: { needsGoogleSync: false } }],
    ]);
    expect(mocks.professional.update.mock.calls).toEqual([[{ where: proScope, data: { googleSyncError: null }, select: { id: true } }]]);
  });

  it("records a provider failure only for the original professional and does not clear pending work", async () => {
    mocks.appointment.findMany.mockResolvedValue([{ id: "cancelled", status: "CANCELLED", googleEventId: "original-event" }]);
    mocks.deleteEvent.mockRejectedValue(new Error("provider unavailable"));
    await expect(syncGoogleCalendar()).resolves.toEqual({ processed: 0, error: "provider unavailable" });
    expect(mocks.appointment.update).not.toHaveBeenCalled();
    expect(mocks.professional.update.mock.calls).toEqual([[{
      where: proScope, data: { googleSyncError: "provider unavailable" }, select: { id: true },
    }]]);
  });
});
