import "server-only";
import { cookies } from "next/headers";
import { createPatientToken, verifyPatientToken } from "@nutri-bot/db/domain";
import { prisma } from "@nutri-bot/db";

const COOKIE_NAME = "patient_session";
const SESSION_TTL_MINUTES = 60 * 24 * 30; // 30 días

export async function setPatientSessionCookie(patientId: string) {
  const token = createPatientToken(patientId, SESSION_TTL_MINUTES);
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

/** Paciente logueado en el portal, o null si no hay sesión válida. */
export async function getPortalPatient() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const patientId = verifyPatientToken(token);
  if (!patientId) return null;
  return prisma.patient.findUnique({ where: { id: patientId } });
}
