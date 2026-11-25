"use server";

import { revalidatePath } from "next/cache";
import { PROFESSIONAL_TEXT, signatureImageSizeError, validateSignatureImage } from "@nutri-bot/core";
import { removeProfessionalSignature, updateProfessionalSignature } from "@nutri-bot/db/domain";
import { errorCode } from "@/lib/error-code";
import { requireTenantContext } from "@/lib/tenant-context";
import type { SettingsState } from "./actions";

// HU-016: subir y quitar la imagen de la firma. Archivo aparte de actions.ts para testearlo aislado.
// D10: la firma nunca va a logs. Los errores se loguean SOLO con su código o clase: un error de
// Prisma puede imprimir los argumentos del update (o sea, los bytes de la imagen).

// HU-025: la firma es de la profesional del consultorio del contexto. Sin contexto (sesión vencida o
// membresía revocada) → el mismo aviso de sesión vencida. 025d la veda en modo soporte (C2).

export async function uploadSignatureAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const ctx = await requireTenantContext("write").catch(() => null);
  if (!ctx) return { ok: false, error: PROFESSIONAL_TEXT.sessionExpired };

  const file = formData.get("signature");
  if (!(file instanceof File)) return { ok: false, error: PROFESSIONAL_TEXT.signatureEmpty };

  // Pre-chequeo por tamaño sin leer el archivo.
  const sizeError = signatureImageSizeError(file.size);
  if (sizeError) return { ok: false, error: sizeError };

  // Se ignoran file.type y file.name: manda el tipo detectado por magic bytes.
  const bytes = Buffer.from(await file.arrayBuffer());
  const check = validateSignatureImage(bytes);
  if (!check.ok) return { ok: false, error: check.error };

  try {
    await updateProfessionalSignature(ctx, { data: bytes, mimeType: check.mimeType });
  } catch (err) {
    console.error("uploadSignatureAction: no se pudo guardar", errorCode(err));
    return { ok: false, error: PROFESSIONAL_TEXT.signatureSaveError };
  }
  revalidatePath("/ajustes");
  return { ok: true };
}

// `_prev` lo exige useActionState; esta action no lo usa.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function removeSignatureAction(_prev: SettingsState): Promise<SettingsState> {
  const ctx = await requireTenantContext("write").catch(() => null);
  if (!ctx) return { ok: false, error: PROFESSIONAL_TEXT.sessionExpired };
  try {
    await removeProfessionalSignature(ctx);
  } catch (err) {
    console.error("removeSignatureAction: no se pudo quitar", errorCode(err));
    return { ok: false, error: PROFESSIONAL_TEXT.signatureRemoveError };
  }
  revalidatePath("/ajustes");
  return { ok: true };
}
