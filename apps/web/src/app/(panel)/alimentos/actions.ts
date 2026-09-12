"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createFood, updateFood } from "@nutri-bot/db/domain";
import { FOOD_GROUPS } from "@/lib/food-groups";

export type FoodState = { ok: boolean; error?: string };

const foodSchema = z.object({
  name: z.string().trim().min(2).max(120),
  group: z.enum(FOOD_GROUPS as [string, ...string[]]),
  kcalPer100: z.coerce.number().min(0).max(9999),
  proteinPer100: z.coerce.number().min(0).max(999),
  carbsPer100: z.coerce.number().min(0).max(999),
  fatPer100: z.coerce.number().min(0).max(999),
  unitHint: z.string().trim().max(120).optional().or(z.literal("")),
});

export async function createFoodAction(
  _prev: FoodState,
  formData: FormData,
): Promise<FoodState> {
  const parsed = foodSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  const food = await createFood({
    ...parsed.data,
    group: parsed.data.group as never,
    unitHint: parsed.data.unitHint || null,
  });
  revalidatePath("/alimentos");
  redirect(`/alimentos/${food.id}`);
}

export async function updateFoodAction(
  id: string,
  _prev: FoodState,
  formData: FormData,
): Promise<FoodState> {
  const parsed = foodSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  await updateFood(id, {
    ...parsed.data,
    group: parsed.data.group as never,
    unitHint: parsed.data.unitHint || null,
  });
  revalidatePath("/alimentos");
  revalidatePath(`/alimentos/${id}`);
  return { ok: true };
}

export async function setFoodActiveAction(id: string, active: boolean): Promise<void> {
  await updateFood(id, { active });
  revalidatePath("/alimentos");
}
