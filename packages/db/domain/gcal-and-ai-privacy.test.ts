// HU-013 (D9): el motivo de consulta no sale hacia Google Calendar ni hacia la IA del bot.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  getProfessional: vi.fn(),
  getAvailableSlotsForService: vi.fn(),
  prisma: {
    appointment: { findMany: vi.fn(), update: vi.fn() },
    professional: { update: vi.fn() },
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
  getProfessional: mocks.getProfessional,
  getAvailableSlotsForService: mocks.getAvailableSlotsForService,
}));

import { runBotAiTool } from "./botAi";
import { syncGoogleCalendar } from "./gcal";

const SECRET = "Tengo diabetes y estoy embarazada (MOTIVO-PRIVADO)";
const TZ = "America/Argentina/Buenos_Aires";
const NOW = new Date("2026-10-03T02:10:00Z");

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
    mocks.getProfessional.mockResolvedValue({
      timezone: TZ,
      currency: "ARS",
      googleRefreshToken: "rt",
      googleCalendarId: null,
      googleSyncError: null,
    });
    mocks.insert.mockResolvedValue({ data: { id: "evt" } });
    mocks.patch.mockResolvedValue({ data: {} });
    mocks.prisma.appointment.update.mockResolvedValue({});
  });

  it("Google, alta: el evento no lleva el motivo", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([appt(null)]);
    const r = await syncGoogleCalendar();
    expect(r).toEqual({ processed: 1 });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    const sent = JSON.stringify(mocks.insert.mock.calls);
    expect(sent).toContain("Primera consulta");
    expect(sent).not.toContain("MOTIVO-PRIVADO");
    expect(sent).not.toContain(SECRET);
  });

  it("Google, cambio: el patch no lleva el motivo", async () => {
    mocks.prisma.appointment.findMany.mockResolvedValue([appt("evt")]);
    await syncGoogleCalendar();
    expect(mocks.patch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.patch.mock.calls)).not.toContain("MOTIVO-PRIVADO");
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
    const r = await runBotAiTool({ name: "mis_turnos", input: {}, patientId: "p1", now: NOW });
    expect(r.isError).toBe(false);
    expect(r.content).toContain("Antropometría");
    expect(r.content).not.toContain("MOTIVO-PRIVADO");
  });
});
