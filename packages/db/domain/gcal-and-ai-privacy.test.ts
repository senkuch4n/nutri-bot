// HU-013 (D9): el motivo de consulta no sale hacia Google Calendar ni hacia la IA del bot.
import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_SECRET_AAD, sealSecret } from "./secretBox";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  getTenantProfessional: vi.fn(),
  getAvailableSlotsForService: vi.fn(),
  prisma: {
    agenda: { findUnique: vi.fn(), findFirst: vi.fn() },
    appointment: { findMany: vi.fn(), update: vi.fn() },
    googleCalendarAccount: { findUnique: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    calendar: () => ({ events: { insert: mocks.insert, patch: mocks.patch, delete: mocks.del } }),
  },
}));
vi.mock("../index", () => ({ prisma: mocks.prisma }));
vi.mock("./availability", () => ({
  getAvailableSlotsForService: mocks.getAvailableSlotsForService,
}));
vi.mock("./tenantScope", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tenantScope")>()),
  getTenantProfessional: mocks.getTenantProfessional,
}));

import { runBotAiTool } from "./botAi";
import { syncGoogleCalendar } from "./gcal";

const SECRET = "Tengo diabetes y estoy embarazada (MOTIVO-PRIVADO)";
const TZ = "America/Argentina/Buenos_Aires";
const NOW = new Date("2026-10-03T02:10:00Z");
const KEY_B64 = randomBytes(32).toString("base64");
const ENV = { INTEGRATION_TOKEN_KEY: KEY_B64 };
const DEPS = {
  env: ENV,
  events: () => ({ insert: mocks.insert, patch: mocks.patch, delete: mocks.del }),
};
const APPT_WHERE = {
  id: "a1",
  tenantId: "legacy-tenant",
  agendaId: "legacy-agenda",
  agenda: { isPrimary: true, professionalId: 1 },
};

function appt(googleEventId: string | null) {
  return {
    id: "a1",
    status: "CONFIRMED",
    googleEventId,
    startsAt: new Date("2026-10-12T13:00:00Z"),
    endsAt: new Date("2026-10-12T13:30:00Z"),
    reason: SECRET,
    patient: { name: "Ana (TEST)", phone: "5490000000031" },
    service: { name: "Primera consulta" },
  };
}

describe("privacidad del motivo (HU-013, D9)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getTenantProfessional.mockResolvedValue({ timezone: TZ, currency: "ARS" });
    mocks.prisma.agenda.findFirst.mockResolvedValue({
      id: "legacy-agenda",
      tenantId: "legacy-tenant",
      professionalId: 1,
      professional: { timezone: TZ },
    });
    mocks.prisma.googleCalendarAccount.findUnique.mockResolvedValue({
      refreshTokenEnc: sealSecret("rt", Buffer.from(KEY_B64, "base64"), GOOGLE_SECRET_AAD.refreshToken("legacy-tenant")),
      calendarId: null,
      syncError: null,
    });
    mocks.insert.mockResolvedValue({ data: { id: "evt" } });
    mocks.patch.mockResolvedValue({ data: {} });
    mocks.prisma.appointment.update.mockResolvedValue({});
  });

  it("Google, alta: el evento no lleva el motivo", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([appt(null)]);
    const r = await syncGoogleCalendar({ tenantId: "legacy-tenant" }, DEPS);
    expect(r).toEqual({ processed: 1 });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ calendarId: "primary" }));
    const sent = JSON.stringify(mocks.insert.mock.calls);
    expect(sent).toContain("Primera consulta");
    expect(sent).not.toContain("MOTIVO-PRIVADO");
    expect(sent).not.toContain(SECRET);
    expect(mocks.prisma.appointment.update.mock.calls).toEqual([[{
      where: APPT_WHERE, data: { googleEventId: "evt", needsGoogleSync: false },
    }]]);
  });

  it("Google, cambio: el patch no lleva el motivo", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([appt("evt")]);
    await expect(syncGoogleCalendar({ tenantId: "legacy-tenant" }, DEPS)).resolves.toEqual({ processed: 1 });
    expect(mocks.patch).toHaveBeenCalledTimes(1);
    expect(mocks.patch).toHaveBeenCalledWith(expect.objectContaining({ calendarId: "primary", eventId: "evt" }));
    expect(JSON.stringify(mocks.patch.mock.calls)).not.toContain("MOTIVO-PRIVADO");
    expect(mocks.prisma.appointment.update.mock.calls).toEqual([[{
      where: APPT_WHERE, data: { needsGoogleSync: false },
    }]]);
  });

  it("IA, mis_turnos: la respuesta no lleva el motivo", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([
      {
        id: "a1",
        startsAt: new Date("2026-10-08T13:00:00Z"),
        status: "CONFIRMED",
        reason: SECRET,
        service: { name: "Antropometría" },
      },
    ]);
    const r = await runBotAiTool({ name: "mis_turnos", input: {}, patientId: "p1", tenantId: "legacy-tenant", now: NOW });
    expect(r.isError).toBe(false);
    expect(r.content).toContain("Antropometría");
    expect(r.content).not.toContain("MOTIVO-PRIVADO");
  });
});
