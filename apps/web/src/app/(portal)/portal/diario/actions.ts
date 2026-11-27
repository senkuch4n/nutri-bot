"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@nutri-bot/db";
import { addDiaryEntry, deleteDiaryEntry } from "@nutri-bot/db/domain";
import { PORTAL_DIARY_TEXT } from "@nutri-bot/core";
import { getPortalSession } from "@/lib/patient-session";

// HU-017d-2 (SDD 4.4): errores en lenguaje simple (T10) y borrado idempotente para el "Deshacer" (T9d).

export type DiaryState = { ok: boolean; error?: string };
export type DiaryDeleteResult = { ok: boolean; error?: string };

const ALLOWED_PHOTO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

function revalidateDiary() {
  revalidatePath("/portal/diario");
  revalidatePath("/portal"); // el conteo "Hoy anotaste…" del inicio
}

export async function addDiaryEntryAction(_prev: DiaryState, formData: FormData): Promise<DiaryState> {
  // HU-033 (025c): el diario se escribe en el consultorio de la sesión del portal; sin sesión no hay acceso.
  const session = await getPortalSession();
  if (!session) return { ok: false, error: PORTAL_DIARY_TEXT.errorNoAccess };
  const { patient } = session;
  const tenant = { tenantId: session.tenantId };

  const note = String(formData.get("note") ?? "").trim();
  const photo = formData.get("photo");
  let photoData: Buffer | null = null;
  let photoMimeType: string | null = null;

  if (photo instanceof File && photo.size > 0) {
    if (!ALLOWED_PHOTO_TYPES.has(photo.type) || photo.size > MAX_PHOTO_BYTES) {
      return { ok: false, error: PORTAL_DIARY_TEXT.errorPhoto };
    }
    photoData = Buffer.from(await photo.arrayBuffer());
    photoMimeType = photo.type;
  }

  if (!note && !photoData) return { ok: false, error: PORTAL_DIARY_TEXT.errorEmpty };

  try {
    await addDiaryEntry(tenant, patient.id, { note: note || null, photoData, photoMimeType });
  } catch {
    return { ok: false, error: PORTAL_DIARY_TEXT.errorSave };
  }
  revalidateDiary();
  return { ok: true };
}

export async function deleteDiaryEntryAction(id: string): Promise<DiaryDeleteResult> {
  const session = await getPortalSession();
  if (!session) return { ok: false, error: PORTAL_DIARY_TEXT.errorNoAccess };
  if (typeof id !== "string" || !id) return { ok: false };
  const tenant = { tenantId: session.tenantId };

  try {
    // HU-033 (025c): solo entradas del paciente de la sesión y de su consultorio. Una de otro paciente o de
    // otro consultorio responde igual que una inexistente.
    const entry = await prisma.diaryEntry.findFirst({
      where: { id, patientId: session.patient.id, patient: { tenantId: tenant.tenantId } },
      select: { id: true },
    });
    // Ya no está: el borrado es idempotente (un segundo commit o un registro borrado en otra pestaña).
    if (!entry) return { ok: true };
    await deleteDiaryEntry(tenant, id);
  } catch (error) {
    // Se borró entre la consulta y el delete (otra pestaña): también es "ya no está".
    if ((error as { code?: unknown } | null)?.code === "P2025") return { ok: true };
    return { ok: false, error: PORTAL_DIARY_TEXT.deleteError };
  }
  revalidateDiary();
  return { ok: true };
}
