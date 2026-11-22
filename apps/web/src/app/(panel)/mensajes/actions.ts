"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { markInquiryAnswered } from "@nutri-bot/db/domain";
import { requireTenantContext } from "@/lib/tenant-context";

export type InquiryActionState = { ok: boolean; error?: string };

/** HU-011: marca una consulta como respondida. Idempotente ("ya respondida" cuenta como ok). */
export async function markInquiryAnsweredAction(id: string): Promise<InquiryActionState> {
  const parsed = z.string().min(1).safeParse(id);
  if (!parsed.success) return { ok: false, error: "La consulta ya no existe." };
  try {
    // HU-025: una consulta de otro consultorio da "ya no existe", igual que una inexistente.
    const ctx = await requireTenantContext("write");
    const result = await markInquiryAnswered(ctx, parsed.data);
    if (result === "not_found") return { ok: false, error: "La consulta ya no existe." };
  } catch {
    return { ok: false, error: "No se pudo marcar la consulta. Probá de nuevo." };
  }
  revalidatePath("/mensajes");
  // Refresca el contador de pendientes de la sidebar (layout del panel).
  revalidatePath("/", "layout");
  return { ok: true };
}
