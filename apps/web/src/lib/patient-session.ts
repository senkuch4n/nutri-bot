import "server-only";
import { cookies } from "next/headers";
import { createPatientToken, verifyPatientToken, type PatientPortalClaims } from "@nutri-bot/db/domain";
import { prisma, type Patient } from "@nutri-bot/db";

const COOKIE_NAME = "patient_session";
const SESSION_TTL_MINUTES = 60 * 24 * 30; // 30 días

export async function setPatientSessionCookie(claims: PatientPortalClaims) {
  const token = createPatientToken(claims, SESSION_TTL_MINUTES);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/portal",
    maxAge: SESSION_TTL_MINUTES * 60,
  });
}

export async function clearPatientSessionCookie() {
  const store = await cookies();
  store.set(COOKIE_NAME, "", { path: "/portal", maxAge: 0 });
}

export type PortalSession = { patient: Patient; tenantId: string };

/** HU-033 (025c, 4.7): sesión del portal. La cookie identifica paciente Y consultorio; el paciente tiene que
 *  existir en ese consultorio. Sin filtro de archivedAt (D9c): un paciente archivado sigue entrando.
 *  Cookie ausente, vieja (v1), manipulada o vencida, o paciente de otro consultorio → null. */
export async function getPortalSession(): Promise<PortalSession | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const claims = verifyPatientToken(token);
  if (!claims) return null;
  const patient = await prisma.patient.findFirst({ where: { id: claims.patientId, tenantId: claims.tenantId } });
  return patient ? { patient, tenantId: claims.tenantId } : null;
}

/** Paciente logueado en el portal, o null si no hay sesión válida. */
export async function getPortalPatient(): Promise<Patient | null> {
  return (await getPortalSession())?.patient ?? null;
}
