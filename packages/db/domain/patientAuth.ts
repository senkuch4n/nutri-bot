import { createHmac, timingSafeEqual } from "node:crypto";

// HU-025c / HU-033 (4.7 de la SDD): el token del portal identifica paciente Y consultorio.
// Formato v2: "p2.<patientId>.<tenantId>.<exp>.<firma>", firma = HMAC-SHA256(clave, "patient-portal:v2|<patientId>|<tenantId>|<exp>")
// en hex, con clave = HMAC-SHA256(AUTH_SECRET, "nutribot/patient-portal") (separación de dominio).
// Un token v1 ("<id>.<exp>.<firma>") ya no vale: el paciente pide un link nuevo (D9b).

export type PatientPortalClaims = { patientId: string; tenantId: string };

const PREFIX = "p2";
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const HEX_RE = /^[0-9a-f]{64}$/;

function portalKey(secret: string): Buffer {
  return createHmac("sha256", secret).update("nutribot/patient-portal").digest();
}

function signature(secret: string, patientId: string, tenantId: string, exp: string): string {
  return createHmac("sha256", portalKey(secret)).update(`patient-portal:v2|${patientId}|${tenantId}|${exp}`).digest("hex");
}

/** Genera un token firmado para el paciente de un consultorio, válido por `ttlMinutes` minutos. */
export function createPatientToken(claims: PatientPortalClaims, ttlMinutes: number): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET must be set to create a patient portal token");
  }
  if (!ID_RE.test(claims.patientId) || !ID_RE.test(claims.tenantId)) {
    throw new Error("Invalid patient portal claims");
  }

  const exp = String(Math.floor(Date.now() / 1000) + Math.floor(ttlMinutes * 60));
  return [PREFIX, claims.patientId, claims.tenantId, exp, signature(secret, claims.patientId, claims.tenantId, exp)].join(".");
}

/** Verifica un token v2; devuelve paciente y consultorio si es válido y no venció, o null. Nunca tira. */
export function verifyPatientToken(token: string): PatientPortalClaims | null {
  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret || typeof token !== "string") return null;

    const parts = token.split(".");
    if (parts.length !== 5) return null;
    const [prefix, patientId, tenantId, expText, provided] = parts as [string, string, string, string, string];
    if (prefix !== PREFIX || !ID_RE.test(patientId) || !ID_RE.test(tenantId) || !HEX_RE.test(provided)) return null;
    if (!/^\d{1,12}$/.test(expText)) return null;

    const exp = Number(expText);
    if (!Number.isSafeInteger(exp) || exp <= Math.floor(Date.now() / 1000)) return null;

    const expected = Buffer.from(signature(secret, patientId, tenantId, expText), "hex");
    const given = Buffer.from(provided, "hex");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

    return { patientId, tenantId };
  } catch {
    return null;
  }
}
