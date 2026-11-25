"use server";

import { z } from "zod";
import {
  copyDay,
  moveMeal,
  renameMeal,
  repeatMealInAllDays,
  restoreMealSnapshots,
  setMealMode,
  setMealOptions,
  type MealOwnerKind,
  type MealSnapshot,
} from "@nutri-bot/db/domain";
import { WEEKDAYS, type Weekday } from "@nutri-bot/core";
import { revalidateMenuOwner } from "@/lib/revalidate-menu-owner";
import { errorCode } from "@/lib/error-code";
import { requireTenantContext } from "@/lib/tenant-context";
import { touchTemplate } from "@/lib/touch-template";

// HU-018b (SDD 6.1): acciones del editor semanal, compartidas por planes y plantillas. Cada una
// valida con zod, llama a domain (que verifica que la comida sea del dueño), revalida y devuelve un
// resultado para `useTransition`. Las que cambian contenido devuelven la foto anterior (`undo`).

export type MenuActionResult = { ok: true; undo?: MealSnapshot[] } | { ok: false; error: string };

const GENERIC_ERROR = "No se pudo guardar. Probá de nuevo.";

const kindSchema = z.enum(["plan", "template"]);
const idSchema = z.string().min(1).max(64);
const weekdaySchema = z.enum(WEEKDAYS);
const modeSchema = z.enum(["EVERY_DAY", "PER_DAY"]);

const ownerSchema = z.object({ kind: kindSchema, ownerId: idSchema });

/** Valida, ejecuta y revalida. Cualquier error (zod o de domain) → mensaje genérico para el toast. */
async function run<S extends z.ZodType<{ kind: MealOwnerKind; ownerId: string }>>(
  schema: S,
  input: unknown,
  fn: (data: z.infer<S>, tenantId: string) => Promise<MealSnapshot[] | void>,
): Promise<MenuActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  try {
    const { kind, ownerId } = parsed.data;
    // HU-025: plan o plantilla, siempre con el consultorio de la sesión (sin él, el dominio no lo toca).
    const ctx = await requireTenantContext("write");
    const undo = await fn(parsed.data, ctx.tenantId);
    if (kind === "template") await touchTemplate(ownerId, ctx.tenantId);
    else await revalidateMenuOwner(kind, ownerId, ctx.tenantId);
    return undo ? { ok: true, undo } : { ok: true };
  } catch (err) {
    // D11: solo el código del error (un error de Prisma puede traer los argumentos del pedido).
    console.error("[weekly-menu]", errorCode(err));
    return { ok: false, error: GENERIC_ERROR };
  }
}

const setModeSchema = ownerSchema.extend({
  mealId: idSchema,
  mode: modeSchema,
  keepWeekday: weekdaySchema.optional(),
});
export async function setMealModeAction(input: {
  kind: MealOwnerKind; ownerId: string; mealId: string; mode: "EVERY_DAY" | "PER_DAY"; keepWeekday?: Weekday;
}): Promise<MenuActionResult> {
  return run(setModeSchema, input, async (d, tenantId) => [
    await setMealMode(d.kind, d.ownerId, d.mealId, { mode: d.mode, keepWeekday: d.keepWeekday }, tenantId),
  ]);
}

const setOptionsSchema = ownerSchema.extend({ mealId: idSchema, isOptions: z.boolean() });
export async function setMealOptionsAction(input: {
  kind: MealOwnerKind; ownerId: string; mealId: string; isOptions: boolean;
}): Promise<MenuActionResult> {
  return run(setOptionsSchema, input, (d, tenantId) => setMealOptions(d.kind, d.ownerId, d.mealId, d.isOptions, tenantId));
}

const copyDaySchema = ownerSchema.extend({ from: weekdaySchema, to: z.array(weekdaySchema).min(1).max(6) });
export async function copyDayAction(input: {
  kind: MealOwnerKind; ownerId: string; from: Weekday; to: Weekday[];
}): Promise<MenuActionResult> {
  return run(copyDaySchema, input, (d, tenantId) => copyDay(d.kind, d.ownerId, { from: d.from, to: d.to }, tenantId));
}

const repeatSchema = ownerSchema.extend({ mealId: idSchema, from: weekdaySchema });
export async function repeatMealAction(input: {
  kind: MealOwnerKind; ownerId: string; mealId: string; from: Weekday;
}): Promise<MenuActionResult> {
  return run(repeatSchema, input, async (d, tenantId) => [await repeatMealInAllDays(d.kind, d.ownerId, d.mealId, d.from, tenantId)]);
}

// Foto para Deshacer: viene del cliente, así que se valida estricta (SDD 6.1). La pertenencia de cada
// comida al dueño la verifica restoreMealSnapshots antes de escribir.
const snapshotItemSchema = z.object({
  foodId: idSchema.nullable(),
  customLabel: z.string().max(4000).nullable(),
  quantityGrams: z.number().min(0).max(99999).nullable(),
  notes: z.string().max(4000).nullable(),
  order: z.number().int().min(0).max(10000),
  weekday: weekdaySchema.nullable(),
  // HU-018c (SDD 6.2): ítems de receta. El default deja pasar una foto sin estos campos (una pestaña
  // abierta antes del deploy).
  recipeId: idSchema.nullable().default(null),
  portions: z.number().min(0.5).max(4).multipleOf(0.5).nullable().default(null),
  // HU-018d (SDD 8.4): medida casera. Mismo default para las fotos de antes del deploy.
  measureQty: z.number().min(0.25).max(20).multipleOf(0.25).nullable().default(null),
  measureName: z.string().min(1).max(40).nullable().default(null),
  // 018d-1b (R2): el plural automático de un nombre de 40 caracteres puede pasar de 40 (cada palabra
  // suma "es"); con 80 entra siempre. La columna es TEXT: no hace falta migración.
  measurePlural: z.string().min(1).max(80).nullable().default(null),
  measureGrams: z.number().min(0.1).max(2000).nullable().default(null),
}).strict().superRefine((item, ctx) => {
  const ok = item.recipeId !== null
    ? item.foodId === null && item.quantityGrams === null && item.portions !== null
    : item.portions === null;
  if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ítem de receta inválido" });
  // M1 y M2 (sin la igualdad exacta de gramos, que la verifica el dominio con tolerancia).
  const measure = [item.measureQty, item.measureName, item.measurePlural, item.measureGrams];
  const present = measure.filter((v) => v !== null).length;
  const measureOk = present === 0 ||
    (present === 4 && item.foodId !== null && item.recipeId === null && item.portions === null &&
      item.customLabel === null && item.quantityGrams !== null);
  if (!measureOk) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ítem en medida casera inválido" });
});
const snapshotSchema = z.object({
  mealId: idSchema,
  mode: modeSchema,
  isOptions: z.boolean(),
  items: z.array(snapshotItemSchema).max(400),
}).strict();
const restoreSchema = ownerSchema.extend({
  snapshots: z.array(snapshotSchema).min(1).max(20)
    .refine((list) => list.reduce((n, s) => n + s.items.length, 0) <= 400, "Demasiados ítems"),
});
export async function restoreMealsAction(input: {
  kind: MealOwnerKind; ownerId: string; snapshots: MealSnapshot[];
}): Promise<MenuActionResult> {
  return run(restoreSchema, input, (d, tenantId) => restoreMealSnapshots(d.kind, d.ownerId, d.snapshots, tenantId));
}

const renameSchema = ownerSchema.extend({ mealId: idSchema, name: z.string().trim().min(1).max(60) });
export async function renameMealAction(input: {
  kind: MealOwnerKind; ownerId: string; mealId: string; name: string;
}): Promise<MenuActionResult> {
  return run(renameSchema, input, (d, tenantId) => renameMeal(d.kind, d.ownerId, d.mealId, d.name, tenantId));
}

const moveSchema = ownerSchema.extend({ mealId: idSchema, direction: z.enum(["up", "down"]) });
export async function moveMealAction(input: {
  kind: MealOwnerKind; ownerId: string; mealId: string; direction: "up" | "down";
}): Promise<MenuActionResult> {
  return run(moveSchema, input, (d, tenantId) => moveMeal(d.kind, d.ownerId, d.mealId, d.direction, tenantId));
}
