"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MEASURE_TEXT, duplicateMeasureMessage, type MeasureInput } from "@nutri-bot/core";
import {
  DuplicateFoodMeasureError,
  FoodMeasureNotFoundError,
  InvalidFoodMeasureError,
  createFoodMeasure,
  deleteFoodMeasure,
  moveFoodMeasure,
  setMeasureItemQuantity,
  updateFoodMeasure,
  type FoodMeasureRow,
  type MealOwnerKind,
} from "@nutri-bot/db/domain";
import type {
  FoodMeasureResult,
  FoodMeasureView,
  MeasureFieldErrors,
  MeasureMutationResult,
} from "@/components/food-measures/types";
import { errorCode } from "@/lib/error-code";
import { revalidateMenuOwner } from "@/lib/revalidate-menu-owner";
import { hasPanelSession } from "./recetas/recipe-save";

// HU-018d (SDD 6.1): actions de las medidas caseras de un alimento (ficha y editor del plan). Este
// archivo es "use server": exporta SOLO funciones async (Turbopack rechaza tipos o constantes). Los
// tipos viven en components/food-measures/types.ts. El log lleva solo el código del error.
// No revalidan planes: los ítems guardan una copia de la medida (D4).

const SESSION_EXPIRED = { ok: false as const, error: MEASURE_TEXT.sessionExpired };

const idSchema = z.string().min(1).max(64);
const fieldsSchema = z.object({
  name: z.string().max(200),
  plural: z.string().max(200).nullable(),
  grams: z.number().finite().nullable(),
});
const createSchema = fieldsSchema.extend({ foodId: idSchema });
const updateSchema = fieldsSchema.extend({ measureId: idSchema });
const deleteSchema = z.object({ measureId: idSchema });
const moveSchema = z.object({ measureId: idSchema, direction: z.enum(["up", "down"]) });
const itemQtySchema = z.object({
  kind: z.enum(["plan", "template"]),
  ownerId: idSchema,
  itemId: idSchema,
  qty: z.number().min(0.25).max(20).multipleOf(0.25),
});

function logError(err: unknown): void {
  console.error("[food-measures]", errorCode(err));
}

function toView(m: FoodMeasureRow): FoodMeasureView {
  return { id: m.id, foodId: m.foodId, name: m.name, plural: m.plural, grams: m.grams, order: m.order };
}

/** Errores de dominio → resultado del formulario (un mensaje por campo). */
function toFormError(err: unknown): FoodMeasureResult {
  if (err instanceof InvalidFoodMeasureError) {
    const fieldErrors: MeasureFieldErrors = {};
    for (const issue of err.issues) fieldErrors[issue.field] ??= issue.message;
    return { ok: false, fieldErrors };
  }
  if (err instanceof DuplicateFoodMeasureError) {
    return { ok: false, fieldErrors: { name: duplicateMeasureMessage(err.existingName) } };
  }
  if (err instanceof FoodMeasureNotFoundError) return { ok: false, error: MEASURE_TEXT.notFound };
  logError(err);
  return { ok: false, error: MEASURE_TEXT.saveError };
}

function toMutationError(err: unknown): MeasureMutationResult {
  if (err instanceof FoodMeasureNotFoundError) return { ok: false, error: MEASURE_TEXT.notFound };
  logError(err);
  return { ok: false, error: MEASURE_TEXT.saveError };
}

const measureInput = (d: z.infer<typeof fieldsSchema>): MeasureInput => ({ name: d.name, plural: d.plural, grams: d.grams });

/** Nueva medida en un alimento (SARA 2 o propio). */
export async function createFoodMeasureAction(input: {
  foodId: string;
  name: string;
  plural: string | null;
  grams: number | null;
}): Promise<FoodMeasureResult> {
  if (!(await hasPanelSession())) return SESSION_EXPIRED;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: MEASURE_TEXT.saveError };
  try {
    const measure = await createFoodMeasure(parsed.data.foodId, measureInput(parsed.data));
    revalidatePath(`/alimentos/${measure.foodId}`);
    return { ok: true, measure: toView(measure) };
  } catch (err) {
    return toFormError(err);
  }
}

/** Editar una medida. No toca los ítems que ya la usan (D4). */
export async function updateFoodMeasureAction(input: {
  measureId: string;
  name: string;
  plural: string | null;
  grams: number | null;
}): Promise<FoodMeasureResult> {
  if (!(await hasPanelSession())) return SESSION_EXPIRED;
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: MEASURE_TEXT.saveError };
  try {
    const measure = await updateFoodMeasure(parsed.data.measureId, measureInput(parsed.data));
    revalidatePath(`/alimentos/${measure.foodId}`);
    return { ok: true, measure: toView(measure) };
  } catch (err) {
    return toFormError(err);
  }
}

/** Quitar una medida. Los planes que ya la usan no cambian (D4). */
export async function deleteFoodMeasureAction(input: { measureId: string }): Promise<MeasureMutationResult> {
  if (!(await hasPanelSession())) return SESSION_EXPIRED;
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: MEASURE_TEXT.saveError };
  try {
    const { foodId } = await deleteFoodMeasure(parsed.data.measureId);
    revalidatePath(`/alimentos/${foodId}`);
    return { ok: true };
  } catch (err) {
    return toMutationError(err);
  }
}

/** Subir o bajar una medida en la lista del alimento (la primera es la que se propone, D13). */
export async function moveFoodMeasureAction(input: {
  measureId: string;
  direction: "up" | "down";
}): Promise<MeasureMutationResult> {
  if (!(await hasPanelSession())) return SESSION_EXPIRED;
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: MEASURE_TEXT.saveError };
  try {
    const { foodId } = await moveFoodMeasure(parsed.data.measureId, parsed.data.direction);
    revalidatePath(`/alimentos/${foodId}`);
    return { ok: true };
  } catch (err) {
    return toMutationError(err);
  }
}

/**
 * Stepper del ítem en medida casera (D10): cambia la cantidad y recalcula los gramos con los gramos
 * copiados en el ítem. Revalida el plan o la plantilla (franja del día, promedios).
 */
export async function setMeasureItemQtyAction(input: {
  kind: MealOwnerKind;
  ownerId: string;
  itemId: string;
  qty: number;
}): Promise<MeasureMutationResult> {
  if (!(await hasPanelSession())) return SESSION_EXPIRED;
  const parsed = itemQtySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: MEASURE_TEXT.qtyError };
  const d = parsed.data;
  try {
    await setMeasureItemQuantity(d.kind, d.ownerId, d.itemId, d.qty);
    await revalidateMenuOwner(d.kind, d.ownerId);
    return { ok: true };
  } catch (err) {
    logError(err);
    return { ok: false, error: MEASURE_TEXT.qtyError };
  }
}
