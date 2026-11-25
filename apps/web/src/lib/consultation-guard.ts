import "server-only";
import { prisma } from "@nutri-bot/db";
import type { TenantRef } from "@nutri-bot/db/domain";

// Sin "use server": helper de servidor compartido por las actions de consulta y de prescripción.

/** true si la consulta existe, es del paciente y los dos son del consultorio del contexto (HU-025).
 *  Una consulta de otro consultorio da false, igual que una inexistente. */
export async function belongsToPatient(t: TenantRef, patientId: string, consultationId: string): Promise<boolean> {
  const c = await prisma.consultation.findFirst({
    where: { id: consultationId, tenantId: t.tenantId, patient: { tenantId: t.tenantId } },
    select: { patientId: true },
  });
  return c !== null && c.patientId === patientId;
}
