"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TEAM_TEXT, teamRemoveErrorText } from "@nutri-bot/core";
import { removeTenantMember } from "@nutri-bot/db/domain";
import { errorCode } from "@/lib/error-code";
import { requireOwnerContext } from "@/lib/tenant-context";

// HU-025 (7.2.1 y 9.2 de la SDD): Ajustes → Equipo. Solo la responsable (OWNER) quita accesos; soporte
// nunca (requireOwnerContext). Del formulario se lee SOLO el userId objetivo: el consultorio y quien actúa
// salen del contexto de la sesión. Logs: solo códigos (D11), nunca emails.

export type TeamActionState = { ok: true } | { ok: false; error: string; reauth?: true };

const targetSchema = z.string().trim().min(1).max(64);

export async function removeTeamMemberAction(_prev: TeamActionState | null, formData: FormData): Promise<TeamActionState> {
  let ctx: Awaited<ReturnType<typeof requireOwnerContext>>;
  try {
    ctx = await requireOwnerContext();
  } catch {
    // Sin contexto (membresía revocada) o sin permiso de responsable: error genérico y la UI vuelve a /inicio.
    return { ok: false, error: TEAM_TEXT.genericError, reauth: true };
  }
  const parsed = targetSchema.safeParse(formData.get("userId"));
  if (!parsed.success) return { ok: false, error: TEAM_TEXT.genericError };
  try {
    const result = await removeTenantMember({ tenantId: ctx.tenantId, actorUserId: ctx.userId, targetUserId: parsed.data });
    if (!result.ok) {
      console.error("[team] remove_denied", `reason=${result.reason}`);
      return { ok: false, error: teamRemoveErrorText(result.reason) };
    }
  } catch (error) {
    console.error("[team] remove_failed", errorCode(error));
    return { ok: false, error: TEAM_TEXT.genericError };
  }
  revalidatePath("/ajustes");
  return { ok: true };
}
