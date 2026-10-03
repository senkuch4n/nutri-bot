"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@nutri-bot/db";
import {
  getPlan,
  getFood,
  updatePlan,
  deletePlan,
  addMeal,
  deleteMeal,
  addMealItem,
  deleteMealItem,
  savePlanPdf,
  enqueuePlanPdfMessage,
} from "@nutri-bot/db/domain";
import { getProfessional } from "@/lib/professional";
import { toMealView } from "@/lib/meal-view";
import { renderPlanPdf } from "@/lib/plan-pdf";

export type PlanState = { ok: boolean; error?: string };

async function revalidatePlanPaths(planId: string): Promise<void> {
  const plan = await prisma.nutritionPlan.findUnique({
    where: { id: planId },
    select: { patientId: true },
  });
  if (!plan) return;
  revalidatePath(`/pacientes/${plan.patientId}`);
  revalidatePath(`/pacientes/${plan.patientId}/planes/${planId}`);
}

const metaSchema = z.object({
  planId: z.string().min(1),
  title: z.string().trim().min(2).max(140),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
});

export async function updatePlanMetaAction(
  _prev: PlanState,
  formData: FormData,
): Promise<PlanState> {
  const parsed = metaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  await updatePlan(parsed.data.planId, {
    title: parsed.data.title,
    notes: parsed.data.notes || null,
    status: parsed.data.status,
  });
  await revalidatePlanPaths(parsed.data.planId);
  return { ok: true };
}

export async function deletePlanAction(planId: string, patientId: string): Promise<void> {
  await deletePlan(planId);
  revalidatePath(`/pacientes/${patientId}`);
  redirect(`/pacientes/${patientId}`);
}

export async function addPlanMealAction(formData: FormData): Promise<void> {
  const planId = String(formData.get("planId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!planId || !name) return;
  const plan = await getPlan(planId);
  const order = plan?.meals.length ?? 0;
  await addMeal(planId, { name, order });
  await revalidatePlanPaths(planId);
}

export async function deletePlanMealAction(formData: FormData): Promise<void> {
  const planId = String(formData.get("planId") ?? "");
  const mealId = String(formData.get("mealId") ?? "");
  if (!mealId) return;
  await deleteMeal(mealId);
  await revalidatePlanPaths(planId);
}

export async function addPlanMealItemAction(formData: FormData): Promise<void> {
  const planId = String(formData.get("planId") ?? "");
  const mealId = String(formData.get("mealId") ?? "");
  if (!mealId) return;
  const foodId = String(formData.get("foodId") ?? "").trim();
  const customLabel = String(formData.get("customLabel") ?? "").trim();
  const quantityRaw = String(formData.get("quantityGrams") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!foodId && !customLabel) return;
  if (foodId) {
    const food = await getFood(foodId);
    if (!food || !food.active || food.source !== "SARA2") {
      throw new Error("Solo se pueden agregar alimentos activos de SARA 2.");
    }
  }

  const plan = await getPlan(planId);
  const meal = plan?.meals.find((m) => m.id === mealId);
  const order = meal?.items.length ?? 0;

  await addMealItem(mealId, {
    foodId: foodId || null,
    customLabel: customLabel || null,
    quantityGrams: quantityRaw ? Number(quantityRaw) : null,
    notes: notes || null,
    order,
  });
  await revalidatePlanPaths(planId);
}

export async function deletePlanMealItemAction(formData: FormData): Promise<void> {
  const planId = String(formData.get("planId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) return;
  await deleteMealItem(itemId);
  await revalidatePlanPaths(planId);
}

async function buildAndSavePdf(planId: string) {
  const plan = await getPlan(planId);
  if (!plan) throw new Error("Plan no encontrado");
  const [patient, pro] = await Promise.all([
    prisma.patient.findUniqueOrThrow({ where: { id: plan.patientId } }),
    getProfessional(),
  ]);
  const logoRow = await prisma.professional.findUnique({
    where: { id: 1 },
    select: { logoData: true, logoMimeType: true },
  });

  const buffer = await renderPlanPdf({
    planTitle: plan.title,
    planNotes: plan.notes,
    patientName: patient.name ?? patient.phone,
    professionalName: pro.name,
    logo: logoRow?.logoData && logoRow.logoMimeType ? { data: logoRow.logoData, mimeType: logoRow.logoMimeType } : null,
    meals: toMealView(plan.meals),
    generatedAtLabel: new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(new Date()),
    accentColor: pro.pdfAccentColor,
    footerText: pro.pdfFooterText,
  });

  const fileName = `plan-${plan.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.pdf`;
  await savePlanPdf(planId, { data: buffer, fileName });
  return { patient, fileName };
}

export async function generatePlanPdfAction(planId: string): Promise<PlanState> {
  try {
    await buildAndSavePdf(planId);
    await revalidatePlanPaths(planId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error generando el PDF" };
  }
}

export async function sendPlanWhatsAppAction(planId: string): Promise<PlanState> {
  try {
    const { patient } = await buildAndSavePdf(planId);
    await enqueuePlanPdfMessage({
      planId,
      toJid: patient.whatsappJid,
      caption: "📄 Te comparto tu plan alimentario actualizado.",
    });
    await revalidatePlanPaths(planId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error enviando el plan" };
  }
}
