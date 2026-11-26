// HU-028b: callback del OAuth de Google Calendar, sin base ni red. Solo el OWNER (D4b).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  revalidatePath: vi.fn(),
  requireTenantContext: vi.fn(),
  requireOwnerContext: vi.fn(),
  TenantAccessError: class TenantAccessError extends Error {
    constructor(readonly code: string) { super(code); }
  },
}));
vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: mocks.requireTenantContext,
  requireOwnerContext: mocks.requireOwnerContext,
  TenantAccessError: mocks.TenantAccessError,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db/domain/googleCalendar", () => ({ completeGoogleCalendarOAuth: mocks.complete }));

import { GET } from "./route";

const CALLBACK = "http://internal:3000/api/google-calendar/oauth/callback?code=4/CODE-SECRETO&state=st&scope=x";

describe("GET /api/google-calendar/oauth/callback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("AUTH_URL", "https://panel.example.test");
    mocks.requireOwnerContext.mockResolvedValue({ userId: "u", tenantId: "tenant-a" });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sin contexto (sin sesión, sin membresía) → /inicio sin completar el OAuth", async () => {
    mocks.requireOwnerContext.mockRejectedValue(new mocks.TenantAccessError("no_context"));
    const res = await GET(new Request(CALLBACK));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://panel.example.test/inicio");
    expect(mocks.requireTenantContext).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("un miembro que no es OWNER → gcal=invalid_state sin llamar al dominio", async () => {
    mocks.requireOwnerContext.mockRejectedValue(new mocks.TenantAccessError("owner_only"));
    const res = await GET(new Request(CALLBACK));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://panel.example.test/ajustes?tab=google&gcal=invalid_state");
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("un error que no es de acceso no se disfraza de redirect", async () => {
    mocks.requireOwnerContext.mockRejectedValue(new Error("db down"));
    await expect(GET(new Request(CALLBACK))).rejects.toThrow("db down");
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it.each(["connected", "denied", "invalid_state", "rejected", "scope_denied", "not_configured"])(
    "%s → 303 a /ajustes?tab=google&gcal=<r> sobre AUTH_URL",
    async (result) => {
      mocks.complete.mockResolvedValue(result);
      const res = await GET(new Request(CALLBACK));
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe(`https://panel.example.test/ajustes?tab=google&gcal=${result}`);
      expect(mocks.complete.mock.calls[0]![0]).toEqual({ userId: "u", tenantId: "tenant-a" });
      const arg = mocks.complete.mock.calls[0]![1];
      expect(arg.userId).toBe("u");
      expect(arg.query.get("code")).toBe("4/CODE-SECRETO");
      expect(arg.query.get("state")).toBe("st");
      if (result === "connected") expect(mocks.revalidatePath.mock.calls).toEqual([["/ajustes"]]);
      else expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("una excepción del dominio → rejected y el log es solo el código fijo", async () => {
    mocks.complete.mockRejectedValue(new Error("detalle con CODE-SECRETO"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await GET(new Request(CALLBACK));
      expect(res.headers.get("location")).toBe("https://panel.example.test/ajustes?tab=google&gcal=rejected");
      expect(await res.text()).toBe("");
      expect(log.mock.calls).toEqual([["[google-calendar] oauth_callback_failed"]]);
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("sin AUTH_URL usa la URL del request", async () => {
    vi.stubEnv("AUTH_URL", "");
    mocks.complete.mockResolvedValue("denied");
    const res = await GET(new Request(CALLBACK));
    expect(res.headers.get("location")).toBe("http://internal:3000/ajustes?tab=google&gcal=denied");
  });
});
