"use server";

import { z } from "zod";
import { RECIPE_PICKER_TEXT, WEEKDAYS, type Weekday } from "@nutri-bot/core";
import {
  RecipeNotAvailableError,
  addRecipeItems,
  getRecipePreview,
  recipesForTenant,
  removeMenuItems,
  setRecipeItemPortions,
  type MealOwnerKind,
} from "@nutri-bot/db/domain";
import type {
  AddRecipeResult,
  ListPickerRecipesResult,
  PickerMutationResult,
  RecipePreviewResult,
} from "@/components/recipe-picker/types";
import { errorCode } from "@/lib/error-code";
import { toRecipeCardView } from "@/lib/recipe-view";
import { revalidateMenuOwner } from "@/lib/revalidate-menu-owner";
import { resolvePrivateContentAccess } from "@/lib/private-content-access";
import { touchTemplate } from "@/lib/touch-template";

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

async function refreshPickerOwner(kind: MealOwnerKind, ownerId: string, tenantId: string): Promise<void> {
  if (kind === "template") await touchTemplate(ownerId, tenantId);
  else await revalidateMenuOwner(kind, ownerId);
}

/** Recetas publicadas para la grilla del buscador (se llama cada vez que se abre). */
export async function listPickerRecipesAction(): Promise<ListPickerRecipesResult> {
  try {
    const access = await resolvePrivateContentAccess();
    if (!access) return SESSION_EXPIRED;
    const cards = await recipesForTenant(access.tenantId).list("PUBLISHED");
    return { ok: true, cards: cards.map((c) => toRecipeCardView(c, "panel")) };
  } catch (err) {
    logError(err);
    return { ok: false, error: RECIPE_PICKER_TEXT.loadError };
  }
}

/** HU-018c-2: detalle de la receta (diálogo del buscador). Un borrador o una receta que no existe → notPublished. */
export async function getRecipePreviewAction(recipeId: string): Promise<RecipePreviewResult> {
  try {
    const access = await resolvePrivateContentAccess();
    if (!access) return SESSION_EXPIRED;
    const parsed = idSchema.safeParse(recipeId);
    if (!parsed.success) return { ok: false, error: RECIPE_PICKER_TEXT.notPublished };
    const recipe = await getRecipePreview(parsed.data, access.tenantId);
    if (!recipe) return { ok: false, error: RECIPE_PICKER_TEXT.notPublished };
    return { ok: true, recipe };
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
  try {
    const access = await resolvePrivateContentAccess();
    if (!access) return SESSION_EXPIRED;
    const parsed = addSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: RECIPE_PICKER_TEXT.addError };
    const d = parsed.data;
    const { itemIds } = await addRecipeItems(d.kind, d.ownerId, {
      mealId: d.mealId,
      recipeId: d.recipeId,
      portions: 1,
      weekdays: d.weekdays,
    }, access.tenantId);
    await refreshPickerOwner(d.kind, d.ownerId, access.tenantId);
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
  try {
    const access = await resolvePrivateContentAccess();
    if (!access) return SESSION_EXPIRED;
    const parsed = portionsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: RECIPE_PICKER_TEXT.portionsError };
    const d = parsed.data;
    await setRecipeItemPortions(d.kind, d.ownerId, d.itemId, d.portions, access.tenantId);
    await refreshPickerOwner(d.kind, d.ownerId, access.tenantId);
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
  try {
    const access = await resolvePrivateContentAccess();
    if (!access) return SESSION_EXPIRED;
    const parsed = removeSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: RECIPE_PICKER_TEXT.removeError };
    const d = parsed.data;
    const count = await removeMenuItems(d.kind, d.ownerId, d.itemIds, access.tenantId);
    if (count === 0) return { ok: false, error: RECIPE_PICKER_TEXT.removeError };
    await refreshPickerOwner(d.kind, d.ownerId, access.tenantId);
    return { ok: true };
  } catch (err) {
    logError(err);
    return { ok: false, error: RECIPE_PICKER_TEXT.removeError };
  }
}
