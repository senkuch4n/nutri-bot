// HU-033 (025c, 4.7 de la SDD de HU-025): la sesión del portal identifica paciente Y consultorio.
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  set: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (mocks.jar.has(name) ? { name, value: mocks.jar.get(name)! } : undefined),
    set: mocks.set,
  }),
}));
vi.mock("@nutri-bot/db", () => ({ prisma: { patient: { findFirst: mocks.findFirst, findUnique: mocks.findUnique } } }));
// El token real (sin base): así el test cubre la firma de punta a punta.
vi.mock("@nutri-bot/db/domain", async () => await import("../../../../packages/db/domain/patientAuth"));

import { createPatientToken, verifyPatientToken } from "../../../../packages/db/domain/patientAuth";
import { getPortalPatient, getPortalSession, setPatientSessionCookie } from "./patient-session";

const CLAIMS = { patientId: "pat_a", tenantId: "tenant-a" };

describe("patient-session (portal)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.jar.clear();
    vi.stubEnv("AUTH_SECRET", "secreto-de-prueba");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("setPatientSessionCookie guarda un token v2 con paciente y consultorio, path /portal y 30 días", async () => {
    await setPatientSessionCookie(CLAIMS);
    expect(mocks.set).toHaveBeenCalledTimes(1);
    const [name, token, options] = mocks.set.mock.calls[0]!;
    expect(name).toBe("patient_session");
    expect(verifyPatientToken(token)).toEqual(CLAIMS);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/portal", maxAge: 60 * 60 * 24 * 30 });
  });

  it("sin cookie → null, sin consultar la base", async () => {
    expect(await getPortalSession()).toBeNull();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("cookie vieja (token v1, sin consultorio) → null, sin consultar la base", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const v1 = `pat_a.${exp}.${createHmac("sha256", "secreto-de-prueba").update(`pat_a.${exp}`).digest("hex")}`;
    mocks.jar.set("patient_session", v1);
    expect(await getPortalSession()).toBeNull();
    expect(await getPortalPatient()).toBeNull();
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("cookie válida → busca el paciente por id Y consultorio (sin filtro de archivado)", async () => {
    const patient = { id: "pat_a", tenantId: "tenant-a", archivedAt: null };
    mocks.findFirst.mockResolvedValue(patient);
    mocks.jar.set("patient_session", createPatientToken(CLAIMS, 60));
    expect(await getPortalSession()).toEqual({ patient, tenantId: "tenant-a" });
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id: "pat_a", tenantId: "tenant-a" } });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("el paciente no existe en el consultorio de la cookie (otro tenant o borrado) → null", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.jar.set("patient_session", createPatientToken({ patientId: "pat_b", tenantId: "tenant-a" }, 60));
    expect(await getPortalSession()).toBeNull();
    expect(await getPortalPatient()).toBeNull();
  });

  it("D9c: un paciente archivado sigue entrando al portal", async () => {
    const archived = { id: "pat_a", tenantId: "tenant-a", archivedAt: new Date("2026-11-01T00:00:00Z") };
    mocks.findFirst.mockResolvedValue(archived);
    mocks.jar.set("patient_session", createPatientToken(CLAIMS, 60));
    expect(await getPortalSession()).toEqual({ patient: archived, tenantId: "tenant-a" });
    expect(await getPortalPatient()).toBe(archived);
    const where = mocks.findFirst.mock.calls[0]![0].where;
    expect(where).not.toHaveProperty("archivedAt");
  });
});
