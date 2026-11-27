import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), setCookie: vi.fn(), clearCookie: vi.fn() }));
vi.mock("@nutri-bot/db/domain", () => ({ verifyPatientToken: mocks.verify }));
vi.mock("@/lib/patient-session", () => ({
  setPatientSessionCookie: mocks.setCookie,
  clearPatientSessionCookie: mocks.clearCookie,
}));

import { GET } from "./route";
import { POST } from "../logout/route";

const INTERNAL = "http://0.0.0.0:3000";

describe("portal: las redirecciones usan el dominio público, no el host interno", () => {
  const prev = process.env.AUTH_URL;
  beforeEach(() => {
    process.env.AUTH_URL = "https://numa.example.com";
    vi.clearAllMocks();
  });
  afterEach(() => {
    process.env.AUTH_URL = prev;
  });

  it("login con token válido abre la sesión y va a /portal del dominio público", async () => {
    mocks.verify.mockReturnValue({ patientId: "p1", tenantId: "t1" });
    const res = await GET(new Request(`${INTERNAL}/portal/login?token=ok`));
    expect(mocks.setCookie).toHaveBeenCalledWith({ patientId: "p1", tenantId: "t1" });
    expect(res.headers.get("location")).toBe("https://numa.example.com/portal");
  });

  it("login con token inválido no abre sesión y va al error del dominio público", async () => {
    mocks.verify.mockReturnValue(null);
    const res = await GET(new Request(`${INTERNAL}/portal/login?token=malo`));
    expect(mocks.setCookie).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://numa.example.com/portal?error=invalid");
  });

  it("logout cierra la sesión y va a /portal del dominio público", async () => {
    const res = await POST(new Request(`${INTERNAL}/portal/logout`, { method: "POST" }));
    expect(mocks.clearCookie).toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://numa.example.com/portal");
  });

  it("sin AUTH_URL (dev local) usa el host del pedido", async () => {
    delete process.env.AUTH_URL;
    mocks.verify.mockReturnValue({ patientId: "p1", tenantId: "t1" });
    const res = await GET(new Request("http://localhost:3000/portal/login?token=ok"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/portal");
  });
});
