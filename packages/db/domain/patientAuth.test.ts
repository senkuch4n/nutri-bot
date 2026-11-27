// HU-033 (025c, 4.7 de la SDD de HU-025): token del portal v2 atado a paciente + consultorio.
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPatientToken, verifyPatientToken } from "./patientAuth";

const SECRET = "secreto-de-prueba";
const CLAIMS = { patientId: "pat_A-1", tenantId: "tenant-a" };
const NOW = new Date("2026-11-27T12:00:00Z");

/** Firma igual que el formato v2, para armar tokens a mano en los casos de manipulación. */
function sign(patientId: string, tenantId: string, exp: number, secret = SECRET): string {
  const key = createHmac("sha256", secret).update("nutribot/patient-portal").digest();
  return createHmac("sha256", key).update(`patient-portal:v2|${patientId}|${tenantId}|${exp}`).digest("hex");
}

describe("patientAuth v2", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("AUTH_SECRET", SECRET);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("formato p2.<patientId>.<tenantId>.<exp>.<firma> y la firma usa la clave derivada", () => {
    const token = createPatientToken(CLAIMS, 15);
    const exp = Math.floor(NOW.getTime() / 1000) + 15 * 60;
    expect(token).toBe(`p2.pat_A-1.tenant-a.${exp}.${sign("pat_A-1", "tenant-a", exp)}`);
  });

  it("válido → devuelve paciente y consultorio", () => {
    expect(verifyPatientToken(createPatientToken(CLAIMS, 15))).toEqual(CLAIMS);
  });

  it("vencido → null", () => {
    const token = createPatientToken(CLAIMS, 15);
    vi.setSystemTime(new Date(NOW.getTime() + 15 * 60_000));
    expect(verifyPatientToken(token)).toBeNull();
    vi.setSystemTime(new Date(NOW.getTime() + 15 * 60_000 - 1000));
    expect(verifyPatientToken(token)).toEqual(CLAIMS);
  });

  it("un token v1 (<id>.<exp>.<firma>) → null aunque la firma v1 sea correcta", () => {
    const exp = Math.floor(NOW.getTime() / 1000) + 900;
    const v1sig = createHmac("sha256", SECRET).update(`pat_A-1.${exp}`).digest("hex");
    expect(verifyPatientToken(`pat_A-1.${exp}.${v1sig}`)).toBeNull();
  });

  it("patientId cambiado → null", () => {
    const [p, , tenant, exp, sig] = createPatientToken(CLAIMS, 15).split(".");
    expect(verifyPatientToken([p, "pat_B", tenant, exp, sig].join("."))).toBeNull();
  });

  it("tenantId cambiado → null", () => {
    const [p, patient, , exp, sig] = createPatientToken(CLAIMS, 15).split(".");
    expect(verifyPatientToken([p, patient, "tenant-b", exp, sig].join("."))).toBeNull();
  });

  it("exp cambiado → null", () => {
    const [p, patient, tenant, exp, sig] = createPatientToken(CLAIMS, 15).split(".");
    expect(verifyPatientToken([p, patient, tenant, String(Number(exp) + 3600), sig].join("."))).toBeNull();
  });

  it("firma cambiada o con otro secreto → null", () => {
    const token = createPatientToken(CLAIMS, 15);
    const last = token.at(-1) === "0" ? "1" : "0";
    expect(verifyPatientToken(token.slice(0, -1) + last)).toBeNull();
    const exp = Math.floor(NOW.getTime() / 1000) + 900;
    expect(verifyPatientToken(`p2.pat_A-1.tenant-a.${exp}.${sign("pat_A-1", "tenant-a", exp, "otro")}`)).toBeNull();
    // Firma con el secreto crudo (sin separación de dominio) tampoco vale.
    const raw = createHmac("sha256", SECRET).update(`patient-portal:v2|pat_A-1|tenant-a|${exp}`).digest("hex");
    expect(verifyPatientToken(`p2.pat_A-1.tenant-a.${exp}.${raw}`)).toBeNull();
  });

  it("partes ≠ 5 o prefijo distinto → null", () => {
    const token = createPatientToken(CLAIMS, 15);
    expect(verifyPatientToken(token.replace(/^p2\./, "p3."))).toBeNull();
    expect(verifyPatientToken(`${token}.extra`)).toBeNull();
    expect(verifyPatientToken(token.split(".").slice(0, 4).join("."))).toBeNull();
    expect(verifyPatientToken("")).toBeNull();
    expect(verifyPatientToken(undefined as unknown as string)).toBeNull();
  });

  it("ids con punto o fuera de /^[A-Za-z0-9_-]{1,64}$/: no se emiten y no verifican", () => {
    expect(() => createPatientToken({ patientId: "a.b", tenantId: "t" }, 15)).toThrow();
    expect(() => createPatientToken({ patientId: "a", tenantId: "t/x" }, 15)).toThrow();
    expect(() => createPatientToken({ patientId: "", tenantId: "t" }, 15)).toThrow();
    expect(() => createPatientToken({ patientId: "x".repeat(65), tenantId: "t" }, 15)).toThrow();
    const exp = Math.floor(NOW.getTime() / 1000) + 900;
    expect(verifyPatientToken(`p2.pat A.tenant-a.${exp}.${sign("pat A", "tenant-a", exp)}`)).toBeNull();
    const long = "x".repeat(65);
    expect(verifyPatientToken(`p2.${long}.tenant-a.${exp}.${sign(long, "tenant-a", exp)}`)).toBeNull();
  });

  it("AUTH_SECRET ausente: crear tira y verificar devuelve null", () => {
    const token = createPatientToken(CLAIMS, 15);
    vi.stubEnv("AUTH_SECRET", "");
    expect(() => createPatientToken(CLAIMS, 15)).toThrow();
    expect(verifyPatientToken(token)).toBeNull();
  });
});
