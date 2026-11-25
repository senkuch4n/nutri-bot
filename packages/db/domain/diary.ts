import { prisma } from "../index";
import type { TenantRef } from "./tenantScope";

// HU-025: el diario es del paciente y el paciente es del consultorio. DiaryEntry no tiene tenantId:
// toda lectura y escritura pasa por `patient: { tenantId }`. Consume: panel y portal.

export function listDiaryEntries(t: TenantRef, patientId: string) {
  return prisma.diaryEntry.findMany({
    where: { patientId, patient: { tenantId: t.tenantId } },
    orderBy: { createdAt: "desc" },
  });
}

/** El paciente tiene que ser del consultorio: si no, Prisma no encuentra a quién conectar (P2025). */
export function addDiaryEntry(
  t: TenantRef,
  patientId: string,
  data: { note?: string | null; photoData?: Buffer | null; photoMimeType?: string | null },
) {
  return prisma.diaryEntry.create({
    data: {
      note: data.note,
      photoData: data.photoData,
      photoMimeType: data.photoMimeType,
      patient: { connect: { id_tenantId: { id: patientId, tenantId: t.tenantId } } },
    },
  });
}

/** Una entrada de otro consultorio no se encuentra (P2025), igual que una inexistente. */
export function deleteDiaryEntry(t: TenantRef, id: string) {
  return prisma.diaryEntry.delete({
    where: { id, patient: { tenantId: t.tenantId } },
  });
}
