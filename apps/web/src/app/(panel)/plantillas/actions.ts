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
} from "@nutri-bot/db/domain";

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

export async function addTemplateMealItemAction(formData: FormData): Promise<void> {
  const templateId = String(formData.get("templateId") ?? "");
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

  const template = await getTemplate(templateId);
  const meal = template?.meals.find((m) => m.id === mealId);
  const order = meal?.items.length ?? 0;

  await addTemplateMealItem(mealId, {
    foodId: foodId || null,
    customLabel: customLabel || null,
    quantityGrams: quantityRaw ? Number(quantityRaw) : null,
    notes: notes || null,
    order,
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
