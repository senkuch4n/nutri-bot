"use server";

import { z } from "zod";
import { RECIPE_PICKER_TEXT, WEEKDAYS, type Weekday } from "@nutri-bot/core";
import {
  RecipeNotAvailableError,
  addRecipeItems,
  listRecipeCards,
  removeMenuItems,
  setRecipeItemPortions,
  type MealOwnerKind,
} from "@nutri-bot/db/domain";
import type {
  AddRecipeResult,
  ListPickerRecipesResult,
  PickerMutationResult,
} from "@/components/recipe-picker/types";
import { errorCode } from "@/lib/error-code";
import { toRecipeCardView } from "@/lib/recipe-view";
import { revalidateMenuOwner } from "@/lib/revalidate-menu-owner";
import { hasPanelSession } from "./recetas/recipe-save";

// HU-018c (SDD 6.1): actions del buscador de recetas. Este archivo es "use server": exporta SOLO
// funciones async (Turbopack rechaza tipos o constantes). Los tipos viven en
// components/recipe-picker/types.ts. El log lleva solo el código del error, nunca el payload.

const SESSION_EXPIRED = { ok: false as const, error: RECIPE_PICKER_TEXT.sessionExpired };

const kindSchema = z.enum(["plan", "template"]);
const idSchema = z.string().min(1).max(64);
const ownerSchema = z.object({ kind: kindSchema, ownerId: idSchema });

const addSchema = ownerSchema.extend({
  mealId: idSchema,
  recipeId: idSchema,
  weekdays: z
    .array(z.enum(WEEKDAYS))
    .min(1)
    .max(7)
    .refine((days) => new Set(days).size === days.length, "Días repetidos")
    .nullable(),
});
const portionsSchema = ownerSchema.extend({
  itemId: idSchema,
  portions: z.number().min(0.5).max(4).multipleOf(0.5),
});
const removeSchema = ownerSchema.extend({ itemIds: z.array(idSchema).min(1).max(50) });

function logError(err: unknown): void {
  console.error("[recipe-picker]", errorCode(err));
}

/** Recetas publicadas para la grilla del buscador (se llama cada vez que se abre). */
export async function listPickerRecipesAction(): Promise<ListPickerRecipesResult> {
  if (!(await hasPanelSession())) return SESSION_EXPIRED;
  try {
    const cards = await listRecipeCards({ status: "PUBLISHED" });
    return { ok: true, cards: cards.map((c) => toRecipeCardView(c, "panel")) };
  } catch (err) {
    logError(err);
    return { ok: false, error: RECIPE_PICKER_TEXT.loadError };
  }
}

/** Agrega 1 porción de la receta a la comida (en los días pedidos o todos los días). */
export async function addRecipeToMealAction(input: {
  kind: MealOwnerKind;
  ownerId: string;
  mealId: string;
  recipeId: string;
  weekdays: Weekday[] | null;
}): Promise<AddRecipeResult> {
  if (!(await hasPanelSession())) return SESSION_EXPIRED;
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: RECIPE_PICKER_TEXT.addError };
  const d = parsed.data;
  try {
    const { itemIds } = await addRecipeItems(d.kind, d.ownerId, {
      mealId: d.mealId,
      recipeId: d.recipeId,
      portions: 1,
      weekdays: d.weekdays,
    });
    await revalidateMenuOwner(d.kind, d.ownerId);
    return { ok: true, itemIds };
  } catch (err) {
    logError(err);
    if (err instanceof RecipeNotAvailableError) return { ok: false, error: RECIPE_PICKER_TEXT.notPublished };
    return { ok: false, error: RECIPE_PICKER_TEXT.addError };
  }
}

/** Cambia las porciones de un ítem de receta (pasos de ½ entre ½ y 4). */
export async function setRecipeItemPortionsAction(input: {
  kind: MealOwnerKind;
  ownerId: string;
  itemId: string;
  portions: number;
}): Promise<PickerMutationResult> {
  if (!(await hasPanelSession())) return SESSION_EXPIRED;
  const parsed = portionsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: RECIPE_PICKER_TEXT.portionsError };
  const d = parsed.data;
  try {
    await setRecipeItemPortions(d.kind, d.ownerId, d.itemId, d.portions);
    await revalidateMenuOwner(d.kind, d.ownerId);
    return { ok: true };
  } catch (err) {
    logError(err);
    return { ok: false, error: RECIPE_PICKER_TEXT.portionsError };
  }
}

/** Quita ítems por id (Deshacer de "Agregar" y "Quitar" de la tarjeta). */
export async function removeRecipeItemsAction(input: {
  kind: MealOwnerKind;
  ownerId: string;
  itemIds: string[];
}): Promise<PickerMutationResult> {
  if (!(await hasPanelSession())) return SESSION_EXPIRED;
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: RECIPE_PICKER_TEXT.removeError };
  const d = parsed.data;
  try {
    await removeMenuItems(d.kind, d.ownerId, d.itemIds);
    await revalidateMenuOwner(d.kind, d.ownerId);
    return { ok: true };
  } catch (err) {
    logError(err);
    return { ok: false, error: RECIPE_PICKER_TEXT.removeError };
  }
}
