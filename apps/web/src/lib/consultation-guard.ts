import "server-only";
import { prisma } from "@nutri-bot/db";

// Sin "use server": helper de servidor compartido por las actions de consulta y de prescripción.

/** true si la consulta existe y es del paciente. */
export async function belongsToPatient(patientId: string, consultationId: string): Promise<boolean> {
  const c = await prisma.consultation.findUnique({ where: { id: consultationId }, select: { patientId: true } });
  return c !== null && c.patientId === patientId;
}
