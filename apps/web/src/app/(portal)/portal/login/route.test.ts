// HU-033 (025c): /portal/login canjea un token v2 por la cookie; un token viejo o manipulado → error=invalid.
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ setCookie: vi.fn() }));
vi.mock("@/lib/patient-session", () => ({ setPatientSessionCookie: mocks.setCookie }));
vi.mock("@nutri-bot/db/domain", async () => await import("../../../../../../../packages/db/domain/patientAuth"));

import { createPatientToken } from "../../../../../../../packages/db/domain/patientAuth";
import { GET } from "./route";

const login = (token?: string) =>
  GET(new Request(`http://localhost/portal/login${token === undefined ? "" : `?token=${encodeURIComponent(token)}`}`));

describe("GET /portal/login", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("AUTH_SECRET", "secreto-de-prueba");
    vi.stubEnv("AUTH_URL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("token v2 válido → cookie con paciente y consultorio y redirect a /portal", async () => {
    const res = await login(createPatientToken({ patientId: "pat_a", tenantId: "tenant-a" }, 15));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/portal");
    expect(mocks.setCookie.mock.calls).toEqual([[{ patientId: "pat_a", tenantId: "tenant-a" }]]);
  });

  it.each([
    ["sin token", undefined],
    ["token v1", (() => {
      const exp = Math.floor(Date.now() / 1000) + 900;
      return `pat_a.${exp}.${createHmac("sha256", "secreto-de-prueba").update(`pat_a.${exp}`).digest("hex")}`;
    })()],
    ["consultorio cambiado", "TAMPER"],
  ])("%s → /portal?error=invalid sin cookie", async (_name, token) => {
    const value = token === "TAMPER"
      ? createPatientToken({ patientId: "pat_a", tenantId: "tenant-a" }, 15).replace(".tenant-a.", ".tenant-b.")
      : token;
    const res = await login(value);
    expect(res.headers.get("location")).toBe("http://localhost/portal?error=invalid");
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
});
