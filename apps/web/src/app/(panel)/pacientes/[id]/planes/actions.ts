"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createPlan, applyTemplateToPatient, getTemplate } from "@nutri-bot/db/domain";

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
  const template = await getTemplate(parsed.data.templateId);
  if (!template) return { ok: false, error: "Plantilla no encontrada" };
  if (template.meals.some((meal) => meal.items.some((item) => item.food && item.food.source !== "SARA2"))) {
    return { ok: false, error: "Esta plantilla contiene alimentos PROPIO históricos. Para crear un plan nuevo, usá una plantilla con alimentos SARA 2." };
  }
  const plan = await applyTemplateToPatient(parsed.data.templateId, parsed.data.patientId);
  if (!plan) return { ok: false, error: "No se pudo aplicar la plantilla" };
  revalidatePath(`/pacientes/${parsed.data.patientId}`);
  redirect(`/pacientes/${parsed.data.patientId}/planes/${plan.id}`);
}
