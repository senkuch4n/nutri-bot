// HU-028b: server actions de Google Calendar en Ajustes (sin base ni red). Solo el OWNER (D4b).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class GoogleCalendarConfigError extends Error {}
  return {
    redirect: vi.fn((url: string) => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { url });
    }),
    revalidatePath: vi.fn(),
    start: vi.fn(),
    disconnect: vi.fn(),
    setCalendarId: vi.fn(),
    GoogleCalendarConfigError,
    requireTenantContext: vi.fn(),
    requireOwnerContext: vi.fn(),
    professionalUpdate: vi.fn(),
    TenantAccessError: class TenantAccessError extends Error {
      constructor(readonly code: string) { super(code); }
    },
  };
});
vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: mocks.requireTenantContext,
  requireOwnerContext: mocks.requireOwnerContext,
  TenantAccessError: mocks.TenantAccessError,
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db", () => ({ prisma: { professional: { update: mocks.professionalUpdate } } }));
vi.mock("@/lib/bot-ai", () => ({ getBotAiKeyStatus: vi.fn() }));
vi.mock("@nutri-bot/db/domain", () => ({}));
vi.mock("@nutri-bot/db/domain/googleCalendar", () => ({
  startGoogleCalendarOAuth: mocks.start,
  disconnectGoogleCalendar: mocks.disconnect,
  setGoogleCalendarId: mocks.setCalendarId,
  GoogleCalendarConfigError: mocks.GoogleCalendarConfigError,
}));

import { SETTINGS_TEXT } from "@nutri-bot/core";
import { connectGoogleCalendarAction, disconnectGoogleAction, saveGoogleCalendarIdAction } from "./actions";

async function redirectedTo(run: () => Promise<unknown>): Promise<string> {
  const error = await run().then(
    () => null,
    (e: unknown) => e,
  );
  return (error as { url: string }).url;
}

const OWNER_CTX = { userId: "u-owner", tenantId: "tenant-a", access: { kind: "member", role: "OWNER" } };
const form = (calendarId: string) => {
  const f = new FormData();
  f.set("calendarId", calendarId);
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOwnerContext.mockResolvedValue(OWNER_CTX);
});

describe("connectGoogleCalendarAction", () => {
  it.each(["no_context", "owner_only"])("STAFF / sin contexto (%s) → /inicio, sin iniciar el OAuth", async (code) => {
    mocks.requireOwnerContext.mockRejectedValue(new mocks.TenantAccessError(code));
    expect(await redirectedTo(connectGoogleCalendarAction)).toBe("/inicio");
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.requireTenantContext).not.toHaveBeenCalled();
  });

  it("OWNER → state atado a su userId y al consultorio, redirige a Google", async () => {
    mocks.start.mockResolvedValue({ url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=x" });
    expect(await redirectedTo(connectGoogleCalendarAction)).toBe("https://accounts.google.com/o/oauth2/v2/auth?client_id=x");
    expect(mocks.start).toHaveBeenCalledWith(OWNER_CTX, { userId: "u-owner" });
  });

  it("GoogleCalendarConfigError → Ajustes con gcal=not_configured", async () => {
    mocks.start.mockRejectedValue(new mocks.GoogleCalendarConfigError("x"));
    expect(await redirectedTo(connectGoogleCalendarAction)).toBe("/ajustes?tab=google&gcal=not_configured");
  });

  it("otro error se propaga (no se disfraza de configuración)", async () => {
    mocks.start.mockRejectedValue(new Error("db down"));
    await expect(connectGoogleCalendarAction()).rejects.toThrow("db down");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("disconnectGoogleAction", () => {
  it("OWNER → desconecta el consultorio del contexto y revalida Ajustes", async () => {
    mocks.disconnect.mockResolvedValue({ revoked: true });
    await disconnectGoogleAction();
    expect(mocks.disconnect).toHaveBeenCalledWith(OWNER_CTX);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ajustes");
    expect(mocks.professionalUpdate).not.toHaveBeenCalled();
  });

  it.each(["no_context", "owner_only"])("STAFF / sin contexto (%s) → /inicio sin desconectar", async (code) => {
    mocks.requireOwnerContext.mockRejectedValue(new mocks.TenantAccessError(code));
    expect(await redirectedTo(disconnectGoogleAction)).toBe("/inicio");
    expect(mocks.disconnect).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("saveGoogleCalendarIdAction", () => {
  it("OWNER → guarda el calendario en el consultorio del contexto (vacío = principal)", async () => {
    mocks.setCalendarId.mockResolvedValue(true);
    await expect(saveGoogleCalendarIdAction({ ok: false }, form("  cal-x@group.calendar.google.com "))).resolves.toEqual({ ok: true });
    expect(mocks.setCalendarId).toHaveBeenCalledWith(OWNER_CTX, "cal-x@group.calendar.google.com");
    await saveGoogleCalendarIdAction({ ok: false }, form(""));
    expect(mocks.setCalendarId).toHaveBeenLastCalledWith(OWNER_CTX, null);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ajustes");
    expect(mocks.professionalUpdate).not.toHaveBeenCalled();
  });

  it("sin calendario conectado → error de guardado", async () => {
    mocks.setCalendarId.mockResolvedValue(false);
    await expect(saveGoogleCalendarIdAction({ ok: false }, form("cal"))).resolves.toEqual({ ok: false, error: SETTINGS_TEXT.saveError });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("STAFF → { ok: false } sin llamar al dominio", async () => {
    mocks.requireOwnerContext.mockRejectedValue(new mocks.TenantAccessError("owner_only"));
    const res = await saveGoogleCalendarIdAction({ ok: false }, form("cal"));
    expect(res.ok).toBe(false);
    expect(mocks.setCalendarId).not.toHaveBeenCalled();
    expect(mocks.requireTenantContext).not.toHaveBeenCalled();
  });
});
