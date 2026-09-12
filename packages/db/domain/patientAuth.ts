import { createHmac, timingSafeEqual } from "node:crypto";

/** Genera un token firmado para el paciente, válido por `ttlMinutes` minutos. */
export function createPatientToken(patientId: string, ttlMinutes: number): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET must be set to create a patient portal token");
  }

  const expiresAt = Math.floor(Date.now() / 1000) + Math.floor(ttlMinutes * 60);
  const payload = `${patientId}.${expiresAt}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

/** Verifica un token; devuelve el patientId si es válido y no expiró, o null si no. Nunca tira. */
export function verifyPatientToken(token: string): string | null {
  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret || typeof token !== "string") return null;

    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [patientId, expiresAtText, signature] = parts;
    if (!patientId || !expiresAtText || !signature) return null;

    const expiresAt = Number(expiresAtText);
    if (!Number.isInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null;

    const expected = createHmac("sha256", secret).update(`${patientId}.${expiresAtText}`).digest("hex");
    const providedBuffer = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    if (providedBuffer.length !== expectedBuffer.length) return null;
    if (!timingSafeEqual(providedBuffer, expectedBuffer)) return null;

    return patientId;
  } catch {
    return null;
  }
}
