"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createPlan, applyTemplateToPatient, TemplateNotPublishedError, TemplateApplicationUnavailableError,
  TemplateContainsHistoricalFoodError,
} from "@nutri-bot/db/domain";
import { PLAN_IMPORT_TEXT } from "@nutri-bot/core";
import { resolvePrivateContentAccess } from "@/lib/private-content-access";

export type PlanListState = { ok: boolean; error?: string };

const newPlanSchema = z.object({
  patientId: z.string().min(1),
  title: z.string().trim().min(2).max(140),
});

export async function createPlanAction(
  _prev: PlanListState,
  formData: FormData,
): Promise<PlanListState> {
  const parsed = newPlanSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  const plan = await createPlan(parsed.data.patientId, { title: parsed.data.title });
  revalidatePath(`/pacientes/${parsed.data.patientId}`);
  redirect(`/pacientes/${parsed.data.patientId}/planes/${plan.id}`);
}

const applyTemplateSchema = z.object({
  patientId: z.string().min(1),
  templateId: z.string().min(1),
});

export async function applyTemplateAction(
  _prev: PlanListState,
  formData: FormData,
): Promise<PlanListState> {
  const parsed = applyTemplateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Elegí una plantilla" };
  const access = await resolvePrivateContentAccess();
  if (!access) return { ok: false, error: "Plantilla no encontrada" };
  let plan: Awaited<ReturnType<typeof applyTemplateToPatient>>;
  try {
    plan = await applyTemplateToPatient(parsed.data.templateId, parsed.data.patientId, access.tenantId);
  } catch (err) {
    if (err instanceof TemplateApplicationUnavailableError) return { ok: false, error: "Plantilla no encontrada" };
    if (err instanceof TemplateNotPublishedError) return { ok: false, error: PLAN_IMPORT_TEXT.draftNotApplicable };
    if (err instanceof TemplateContainsHistoricalFoodError) return { ok: false, error: err.message };
    throw err;
  }
  if (!plan) return { ok: false, error: "No se pudo aplicar la plantilla" };
  revalidatePath(`/pacientes/${parsed.data.patientId}`);
  redirect(`/pacientes/${parsed.data.patientId}/planes/${plan.id}`);
}
