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
  nextItemOrder,
  getTenantProfessional,
  type TenantRef,
} from "@nutri-bot/db/domain";
import { MEASURE_TEXT, isWeekday } from "@nutri-bot/core";
import { readMeasureFields, resolveFormMeasure } from "@/lib/measure-form";
import type { AddMealItemResult } from "@/components/food-measures/types";
import { requireTenantContext } from "@/lib/tenant-context";
import { toMealView } from "@/lib/meal-view";
import { renderPlanPdf } from "@/lib/plan-pdf";

export type PlanState = { ok: boolean; error?: string };

async function revalidatePlanPaths(t: TenantRef, planId: string): Promise<void> {
  const plan = await prisma.nutritionPlan.findUnique({
    where: { id: planId, tenantId: t.tenantId },
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
  try {
    // HU-025: plan del consultorio de la sesión; uno de otro consultorio no se encuentra (P2025).
    const ctx = await requireTenantContext("write");
    await updatePlan(ctx, parsed.data.planId, {
      title: parsed.data.title,
      notes: parsed.data.notes || null,
      status: parsed.data.status,
    });
    await revalidatePlanPaths(ctx, parsed.data.planId);
  } catch {
    return { ok: false, error: "No se pudo guardar el plan." };
  }
  return { ok: true };
}

export async function deletePlanAction(planId: string, patientId: string): Promise<void> {
  const ctx = await requireTenantContext("write");
  await deletePlan(ctx, planId);
  revalidatePath(`/pacientes/${patientId}`);
  redirect(`/pacientes/${patientId}`);
}

export async function addPlanMealAction(formData: FormData): Promise<void> {
  const planId = String(formData.get("planId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!planId || !name) return;
  const ctx = await requireTenantContext("write");
  const plan = await getPlan(ctx, planId);
  if (!plan) return;
  await addMeal(ctx, planId, { name, order: plan.meals.length });
  await revalidatePlanPaths(ctx, planId);
}

export async function deletePlanMealAction(formData: FormData): Promise<void> {
  const planId = String(formData.get("planId") ?? "");
  const mealId = String(formData.get("mealId") ?? "");
  if (!mealId) return;
  const ctx = await requireTenantContext("write");
  await deleteMeal(ctx, mealId);
  await revalidatePlanPaths(ctx, planId);
}

export async function addPlanMealItemAction(formData: FormData): Promise<AddMealItemResult | void> {
  const planId = String(formData.get("planId") ?? "");
  const mealId = String(formData.get("mealId") ?? "");
  if (!mealId) return;
  const ctx = await requireTenantContext("write");
  const foodId = String(formData.get("foodId") ?? "").trim();
  const customLabel = String(formData.get("customLabel") ?? "").trim();
  const quantityRaw = String(formData.get("quantityGrams") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  // HU-018b: "" o ausente = todos los días; un valor fuera de WEEKDAYS se ignora como otros datos inválidos.
  const weekdayRaw = String(formData.get("weekday") ?? "").trim();
  if (weekdayRaw && !isWeekday(weekdayRaw)) return;
  const weekday = isWeekday(weekdayRaw) ? weekdayRaw : null;
  if (!foodId && !customLabel) return;
  if (foodId) {
    const food = await getFood(foodId);
    if (!food || !food.active || food.source !== "SARA2") {
      throw new Error("Solo se pueden agregar alimentos activos de SARA 2.");
    }
  }

  // HU-018d (SDD 6.2): medida casera. Con medida, los gramos salen de la medida (el quantityGrams
  // del formulario se ignora) y el ítem no lleva descripción libre.
  const measureFields = readMeasureFields(formData, foodId);
  if (measureFields === "invalid") return;
  const measure = measureFields ? await resolveFormMeasure(foodId, measureFields) : null;
  if (measure === "gone") {
    // 018d-1b (R4): la medida se borró con el editor abierto. Se revalida para que el editor traiga
    // las medidas actuales y se avisa, sin pasar por el error boundary.
    await revalidatePlanPaths(ctx, planId);
    return { ok: false, error: MEASURE_TEXT.measureGone };
  }

  const order = await nextItemOrder("plan", mealId, weekday, ctx);

  await addMealItem(ctx, mealId, measure
    ? { foodId, customLabel: null, notes: notes || null, order, weekday, ...measure }
    : {
        foodId: foodId || null,
        customLabel: customLabel || null,
        quantityGrams: quantityRaw ? Number(quantityRaw) : null,
        notes: notes || null,
        order,
        weekday,
      });
  await revalidatePlanPaths(ctx, planId);
}

export async function deletePlanMealItemAction(formData: FormData): Promise<void> {
  const planId = String(formData.get("planId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) return;
  const ctx = await requireTenantContext("write");
  await deleteMealItem(ctx, itemId);
  await revalidatePlanPaths(ctx, planId);
}

async function buildAndSavePdf(t: TenantRef, planId: string) {
  const plan = await getPlan(t, planId);
  if (!plan) throw new Error("Plan no encontrado");
  const [patient, pro] = await Promise.all([
    prisma.patient.findUniqueOrThrow({ where: { id_tenantId: { id: plan.patientId, tenantId: t.tenantId } } }),
    getTenantProfessional(t.tenantId),
  ]);
  // HU-025b-1: el logo es el de la profesional del consultorio (antes Professional(1)).
  const logoRow = await prisma.professional.findUnique({
    where: { id_tenantId: { id: pro.id, tenantId: t.tenantId } },
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
    // HU-020 (D9): textos del plan.
    sections: plan.sections.map(({ title, body }) => ({ title, body })),
  });

  const fileName = `plan-${plan.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.pdf`;
  await savePlanPdf(t, planId, { data: buffer, fileName });
  return { patient, fileName };
}

export async function generatePlanPdfAction(planId: string): Promise<PlanState> {
  try {
    const ctx = await requireTenantContext("write");
    await buildAndSavePdf(ctx, planId);
    await revalidatePlanPaths(ctx, planId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error generando el PDF" };
  }
}

export async function sendPlanWhatsAppAction(planId: string): Promise<PlanState> {
  try {
    const ctx = await requireTenantContext("write");
    const { patient } = await buildAndSavePdf(ctx, planId);
    await enqueuePlanPdfMessage(ctx, {
      planId,
      toJid: patient.whatsappJid,
      caption: "📄 Te comparto tu plan alimentario actualizado.",
    });
    await revalidatePlanPaths(ctx, planId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error enviando el plan" };
  }
}
