"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@nutri-bot/db";
import { addDiaryEntry, deleteDiaryEntry } from "@nutri-bot/db/domain";
import { getPortalPatient } from "@/lib/patient-session";

export type DiaryState = { ok: boolean; error?: string };

const ALLOWED_PHOTO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

export async function addDiaryEntryAction(
  _prev: DiaryState,
  formData: FormData,
): Promise<DiaryState> {
  const patient = await getPortalPatient();
  if (!patient) return { ok: false, error: "Sesión vencida. Volvé a pedir el link por WhatsApp." };

  const note = String(formData.get("note") ?? "").trim();
  const photo = formData.get("photo");
  let photoData: Buffer | null = null;
  let photoMimeType: string | null = null;

  if (photo instanceof File && photo.size > 0) {
    if (!ALLOWED_PHOTO_TYPES.has(photo.type)) {
      return { ok: false, error: "Formato de foto inválido (usá JPG, PNG o WEBP)" };
    }
    if (photo.size > MAX_PHOTO_BYTES) {
      return { ok: false, error: "La foto pesa más de 3 MB" };
    }
    photoData = Buffer.from(await photo.arrayBuffer());
    photoMimeType = photo.type;
  }

  if (!note && !photoData) {
    return { ok: false, error: "Escribí algo o adjuntá una foto" };
  }

  await addDiaryEntry(patient.id, { note: note || null, photoData, photoMimeType });
  revalidatePath("/portal/diario");
  return { ok: true };
}

export async function deleteDiaryEntryAction(formData: FormData): Promise<void> {
  const patient = await getPortalPatient();
  if (!patient) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const entry = await prisma.diaryEntry.findUnique({ where: { id }, select: { patientId: true } });
  if (!entry || entry.patientId !== patient.id) return;

  await deleteDiaryEntry(id);
  revalidatePath("/portal/diario");
}
