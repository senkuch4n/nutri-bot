import { prisma } from "../index";

export function listDiaryEntries(patientId: string) {
  return prisma.diaryEntry.findMany({
    where: { patientId },
    orderBy: { createdAt: "desc" },
  });
}

export function addDiaryEntry(
  patientId: string,
  data: { note?: string | null; photoData?: Buffer | null; photoMimeType?: string | null },
) {
  return prisma.diaryEntry.create({
    data: { patientId, ...data },
  });
}

export function deleteDiaryEntry(id: string) {
  return prisma.diaryEntry.delete({
    where: { id },
  });
}
