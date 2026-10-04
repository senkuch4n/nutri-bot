"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  addTemplateMeal,
  deleteTemplateMeal,
  addTemplateMealItem,
  deleteTemplateMealItem,
  getTemplate,
  getFood,
  nextItemOrder,
} from "@nutri-bot/db/domain";
import { MEASURE_TEXT, isWeekday } from "@nutri-bot/core";
import { readMeasureFields, resolveFormMeasure } from "@/lib/measure-form";
import type { AddMealItemResult } from "@/components/food-measures/types";

export type TemplateState = { ok: boolean; error?: string };

const templateSchema = z.object({
  title: z.string().trim().min(2).max(140),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function createTemplateAction(
  _prev: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  const parsed = templateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  const template = await createTemplate({ title: parsed.data.title, notes: parsed.data.notes || null });
  revalidatePath("/plantillas");
  redirect(`/plantillas/${template.id}`);
}

export async function updateTemplateAction(
  id: string,
  _prev: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  const parsed = templateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  await updateTemplate(id, { title: parsed.data.title, notes: parsed.data.notes || null });
  revalidatePath("/plantillas");
  revalidatePath(`/plantillas/${id}`);
  return { ok: true };
}

export async function deleteTemplateAction(id: string): Promise<void> {
  await deleteTemplate(id);
  revalidatePath("/plantillas");
  redirect("/plantillas");
}

export async function addTemplateMealAction(formData: FormData): Promise<void> {
  const templateId = String(formData.get("templateId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!templateId || !name) return;
  const template = await getTemplate(templateId);
  const order = template?.meals.length ?? 0;
  await addTemplateMeal(templateId, { name, order });
  revalidatePath(`/plantillas/${templateId}`);
}

export async function deleteTemplateMealAction(formData: FormData): Promise<void> {
  const templateId = String(formData.get("templateId") ?? "");
  const mealId = String(formData.get("mealId") ?? "");
  if (!mealId) return;
  await deleteTemplateMeal(mealId);
  revalidatePath(`/plantillas/${templateId}`);
}

export async function addTemplateMealItemAction(formData: FormData): Promise<AddMealItemResult | void> {
  const templateId = String(formData.get("templateId") ?? "");
  const mealId = String(formData.get("mealId") ?? "");
  if (!mealId) return;
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
    revalidatePath(`/plantillas/${templateId}`);
    return { ok: false, error: MEASURE_TEXT.measureGone };
  }

  const order = await nextItemOrder("template", mealId, weekday);

  await addTemplateMealItem(mealId, measure
    ? { foodId, customLabel: null, notes: notes || null, order, weekday, ...measure }
    : {
        foodId: foodId || null,
        customLabel: customLabel || null,
        quantityGrams: quantityRaw ? Number(quantityRaw) : null,
        notes: notes || null,
        order,
        weekday,
      });
  revalidatePath(`/plantillas/${templateId}`);
}

export async function deleteTemplateMealItemAction(formData: FormData): Promise<void> {
  const templateId = String(formData.get("templateId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) return;
  await deleteTemplateMealItem(itemId);
  revalidatePath(`/plantillas/${templateId}`);
}
