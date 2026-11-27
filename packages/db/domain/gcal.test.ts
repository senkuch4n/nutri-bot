// HU-028b: syncGoogleCalendar por consultorio, con el token cifrado en GoogleCalendarAccount.
import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_SECRET_AAD, sealSecret } from "./secretBox";

const mocks = vi.hoisted(() => ({
  agenda: { findFirst: vi.fn() },
  appointment: { findMany: vi.fn(), update: vi.fn() },
  googleCalendarAccount: { findUnique: vi.fn(), updateMany: vi.fn() },
  professional: { update: vi.fn(), updateMany: vi.fn() },
  googleCalendar: vi.fn(),
  insert: vi.fn(),
  patch: vi.fn(),
  deleteEvent: vi.fn(),
  eventsFactory: vi.fn(),
}));

vi.mock("../index", () => ({ prisma: mocks }));
vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    calendar: mocks.googleCalendar,
  },
}));

import { describeGoogleCalendarError, syncGoogleCalendar } from "./gcal";

const KEY_B64 = randomBytes(32).toString("base64");
const KEY = Buffer.from(KEY_B64, "base64");
const ENV = { INTEGRATION_TOKEN_KEY: KEY_B64 };
const NOW = new Date("2026-11-25T12:00:00Z");
const TZ = "America/Argentina/Buenos_Aires";
const T_A = { tenantId: "tenant-a" };
const scopeA = { tenantId: "tenant-a", agendaId: "agenda-a" };
const agendaOwnerA = { isPrimary: true, professionalId: 7 };
const apptScopeA = { ...scopeA, agenda: agendaOwnerA };

function sealedFor(tenantId: string, token = "rt-a", key = KEY): string {
  return sealSecret(token, key, GOOGLE_SECRET_AAD.refreshToken(tenantId));
}

function account(over: Partial<{ refreshTokenEnc: string | null; calendarId: string | null; syncError: string | null }> = {}) {
  return { refreshTokenEnc: sealedFor("tenant-a"), calendarId: null, syncError: null, ...over };
}

const deps = { env: ENV, now: () => NOW, events: mocks.eventsFactory };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.agenda.findFirst.mockImplementation(async ({ where }) =>
    where.tenantId === "tenant-a" && where.isPrimary === true
      ? { id: "agenda-a", tenantId: "tenant-a", professionalId: 7, professional: { timezone: TZ } }
      : null,
  );
  mocks.googleCalendarAccount.findUnique.mockResolvedValue(account());
  mocks.googleCalendarAccount.updateMany.mockResolvedValue({ count: 1 });
  mocks.appointment.findMany.mockResolvedValue([]);
  mocks.appointment.update.mockResolvedValue({});
  mocks.eventsFactory.mockReturnValue({ insert: mocks.insert, patch: mocks.patch, delete: mocks.deleteEvent });
});

function confirmed(id: string, googleEventId: string | null) {
  return {
    id,
    status: "CONFIRMED",
    googleEventId,
    startsAt: new Date("2026-12-01T13:00:00Z"),
    endsAt: new Date("2026-12-01T13:30:00Z"),
    patient: { name: "Ana", phone: "5490000000001" },
    service: { name: "Consulta" },
  };
}

function expectNoGoogle() {
  expect(mocks.eventsFactory).not.toHaveBeenCalled();
  expect(mocks.googleCalendar).not.toHaveBeenCalled();
}

describe("syncGoogleCalendar(t) — HU-028b", () => {
  it("sin fila → 0, sin consultar turnos ni construir el cliente", async () => {
    mocks.googleCalendarAccount.findUnique.mockResolvedValue(null);
    await expect(syncGoogleCalendar(T_A, deps)).resolves.toEqual({ processed: 0 });
    expect(mocks.googleCalendarAccount.findUnique).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a" },
      select: { refreshTokenEnc: true, calendarId: true, syncError: true },
    });
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
    expectNoGoogle();
  });

  it("fila sin token (desconectado) → 0 y events no llamado", async () => {
    mocks.googleCalendarAccount.findUnique.mockResolvedValue(account({ refreshTokenEnc: null }));
    await expect(syncGoogleCalendar(T_A, deps)).resolves.toEqual({ processed: 0 });
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
    expectNoGoogle();
  });

  it("cola vacía → no descifra ni llama a Google (aunque la clave sea inválida)", async () => {
    await expect(syncGoogleCalendar(T_A, { ...deps, env: {} })).resolves.toEqual({ processed: 0 });
    expect(mocks.appointment.findMany).toHaveBeenCalledOnce();
    expect(mocks.googleCalendarAccount.updateMany).not.toHaveBeenCalled();
    expectNoGoogle();
  });

  it("consulta y escribe solo con el scope del consultorio pedido; calendarId null → primary", async () => {
    mocks.appointment.findMany.mockResolvedValue([confirmed("a1", null)]);
    mocks.insert.mockResolvedValue({ data: { id: "evt-1" } });
    await expect(syncGoogleCalendar(T_A, deps)).resolves.toEqual({ processed: 1 });
    expect(mocks.agenda.findFirst.mock.calls[0]![0].where).toEqual({ tenantId: "tenant-a", isPrimary: true });
    expect(mocks.appointment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ...apptScopeA, needsGoogleSync: true }, orderBy: { updatedAt: "asc" }, take: 25,
    }));
    expect(mocks.eventsFactory.mock.calls).toEqual([["rt-a"]]);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ calendarId: "primary" }));
    expect(mocks.appointment.update.mock.calls).toEqual([[{
      where: { id: "a1", ...apptScopeA }, data: { googleEventId: "evt-1", needsGoogleSync: false },
    }]]);
    expect(mocks.googleCalendarAccount.updateMany).not.toHaveBeenCalled();
  });

  it("usa el calendarId elegido y limpia el syncError previo atado al token leído", async () => {
    const acc = account({ calendarId: "cal-x", syncError: "viejo" });
    mocks.googleCalendarAccount.findUnique.mockResolvedValue(acc);
    mocks.appointment.findMany.mockResolvedValue([{ ...confirmed("a2", "evt-2"), status: "CANCELLED" }]);
    mocks.deleteEvent.mockRejectedValue({ code: 410 });
    await expect(syncGoogleCalendar(T_A, deps)).resolves.toEqual({ processed: 1 });
    expect(mocks.deleteEvent.mock.calls).toEqual([[{ calendarId: "cal-x", eventId: "evt-2" }]]);
    expect(mocks.googleCalendarAccount.updateMany.mock.calls).toEqual([[{
      where: { tenantId: "tenant-a", refreshTokenEnc: acc.refreshTokenEnc },
      data: { syncError: null, syncErrorAt: null },
    }]]);
  });

  it.each([
    ["clave inválida", {}, sealedFor("tenant-a")],
    ["AAD de otro consultorio", ENV, sealedFor("tenant-b")],
    ["otra clave", ENV, sealedFor("tenant-a", "rt-a", randomBytes(32))],
  ])("%s → decrypt_failed, syncError guardado y sin llamar a Google", async (_name, env, enc) => {
    mocks.googleCalendarAccount.findUnique.mockResolvedValue(account({ refreshTokenEnc: enc }));
    mocks.appointment.findMany.mockResolvedValue([confirmed("a1", null)]);
    await expect(syncGoogleCalendar(T_A, { ...deps, env })).resolves.toEqual({ processed: 0, error: "decrypt_failed" });
    expectNoGoogle();
    expect(mocks.appointment.update).not.toHaveBeenCalled();
    expect(mocks.googleCalendarAccount.updateMany.mock.calls).toEqual([[{
      where: { tenantId: "tenant-a", refreshTokenEnc: enc },
      data: { syncError: "No se pudo leer la conexión guardada. Reconectá Google Calendar.", syncErrorAt: NOW },
    }]]);
  });

  it.each([404, 410])("patch %i → googleEventId null y re-encolado, cuenta como procesado", async (status) => {
    mocks.appointment.findMany.mockResolvedValue([confirmed("a3", "evt-gone")]);
    mocks.patch.mockRejectedValue({ response: { status }, code: status });
    await expect(syncGoogleCalendar(T_A, deps)).resolves.toEqual({ processed: 1 });
    expect(mocks.appointment.update.mock.calls).toEqual([[{
      where: { id: "a3", ...apptScopeA }, data: { googleEventId: null, needsGoogleSync: true },
    }]]);
    expect(mocks.googleCalendarAccount.updateMany).not.toHaveBeenCalled();
  });

  it("patch ok → needsGoogleSync false", async () => {
    mocks.appointment.findMany.mockResolvedValue([confirmed("a4", "evt-4")]);
    mocks.patch.mockResolvedValue({});
    await expect(syncGoogleCalendar(T_A, deps)).resolves.toEqual({ processed: 1 });
    expect(mocks.appointment.update.mock.calls).toEqual([[{
      where: { id: "a4", ...apptScopeA }, data: { needsGoogleSync: false },
    }]]);
  });

  it("error tipo Gaxios con Bearer: syncError saneado, sin el secreto, where con el token leído", async () => {
    const acc = account();
    mocks.googleCalendarAccount.findUnique.mockResolvedValue(acc);
    mocks.appointment.findMany.mockResolvedValue([confirmed("a5", null)]);
    const gaxios = Object.assign(new Error("invalid_grant SECRETO"), {
      config: { headers: { Authorization: "Bearer SECRETO" } },
      response: { status: 401, data: { error: "invalid_grant", error_description: "SECRETO" } },
      code: "401",
    });
    mocks.insert.mockRejectedValue(gaxios);
    const res = await syncGoogleCalendar(T_A, deps);
    expect(res).toEqual({ processed: 0, error: "Google Calendar respondió con error (status 401, invalid_grant)" });
    expect(mocks.appointment.update).not.toHaveBeenCalled();
    expect(mocks.googleCalendarAccount.updateMany.mock.calls).toEqual([[{
      where: { tenantId: "tenant-a", refreshTokenEnc: acc.refreshTokenEnc },
      data: { syncError: "Google Calendar respondió con error (status 401, invalid_grant)", syncErrorAt: NOW },
    }]]);
    expect(JSON.stringify(mocks.googleCalendarAccount.updateMany.mock.calls)).not.toContain("SECRETO");
  });

  it("consultorio sin agenda principal → tira sin tocar Google", async () => {
    await expect(syncGoogleCalendar({ tenantId: "sin-agenda" }, deps)).rejects.toThrow();
    expectNoGoogle();
  });

  it("nunca escribe en Professional", async () => {
    mocks.appointment.findMany.mockResolvedValue([confirmed("a1", null)]);
    mocks.insert.mockRejectedValue(new Error("x"));
    await syncGoogleCalendar(T_A, deps);
    expect(mocks.professional.update).not.toHaveBeenCalled();
    expect(mocks.professional.updateMany).not.toHaveBeenCalled();
  });
});

describe("describeGoogleCalendarError", () => {
  it("status y código de response.data.error", () => {
    expect(describeGoogleCalendarError({ response: { status: 401, data: { error: "invalid_grant" } } })).toBe(
      "Google Calendar respondió con error (status 401, invalid_grant)",
    );
  });
  it("código anidado de la API (error.status)", () => {
    expect(
      describeGoogleCalendarError({ response: { status: 403, data: { error: { status: "PERMISSION_DENIED", message: "SECRETO" } } } }),
    ).toBe("Google Calendar respondió con error (status 403, PERMISSION_DENIED)");
  });
  it("code numérico sin response", () => {
    expect(describeGoogleCalendarError({ code: 500 })).toBe("Google Calendar respondió con error (status 500)");
  });
  it("código no identificador → se omite", () => {
    expect(describeGoogleCalendarError({ response: { status: 400, data: { error: "con espacios SECRETO" } } })).toBe(
      "Google Calendar respondió con error (status 400)",
    );
  });
  it("sin status → no respondió (nunca err.message)", () => {
    expect(describeGoogleCalendarError(new Error("ECONNRESET Bearer SECRETO"))).toBe("Google Calendar no respondió");
    expect(describeGoogleCalendarError(null)).toBe("Google Calendar no respondió");
  });
});
