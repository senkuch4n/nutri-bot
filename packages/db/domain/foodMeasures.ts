/**
 * HU-018d: medidas caseras de un alimento ("1 taza = 180 g"). La equivalencia es POR alimento y
 * vale para SARA 2 y PROPIO, activos o no (las medidas no son composición). Los ítems de plan y de
 * plantilla guardan una COPIA de la medida (D4): nada de este archivo toca ítems.
 */
import {
  normalizeMeasureInput,
  normalizeMeasureQty,
  measureItemGrams,
  resolvedMeasurePlural,
  validateMeasure,
  type MeasureInput,
  type MeasureIssue,
} from "@nutri-bot/core";
import { prisma, type Prisma } from "../index";

export const FOOD_MEASURE_SELECT = {
  id: true,
  foodId: true,
  name: true,
  plural: true,
  grams: true,
  order: true,
} satisfies Prisma.FoodMeasureSelect;

/** grams ya como number. */
export interface FoodMeasureRow {
  id: string;
  foodId: string;
  name: string;
  plural: string | null;
  grams: number;
  order: number;
}

export class InvalidFoodMeasureError extends Error {
  constructor(public readonly issues: MeasureIssue[]) {
    super("Medida casera inválida.");
    this.name = "InvalidFoodMeasureError";
  }
}
export class DuplicateFoodMeasureError extends Error {
  constructor(public readonly existingName: string) {
    super(`El alimento ya tiene la medida «${existingName}».`);
    this.name = "DuplicateFoodMeasureError";
  }
}
export class FoodMeasureNotFoundError extends Error {
  constructor(message = "La medida casera no existe.") {
    super(message);
    this.name = "FoodMeasureNotFoundError";
  }
}

type SelectedRow = { id: string; foodId: string; name: string; plural: string | null; grams: { toString(): string }; order: number };

function toRow(r: SelectedRow): FoodMeasureRow {
  return { id: r.id, foodId: r.foodId, name: r.name, plural: r.plural, grams: Number(r.grams), order: r.order };
}

const isUniqueViolation = (err: unknown) => (err as { code?: string } | null)?.code === "P2002";

/** Medidas de un alimento por `order` asc (ficha). */
export async function listFoodMeasures(foodId: string): Promise<FoodMeasureRow[]> {
  const rows = await prisma.foodMeasure.findMany({
    where: { foodId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: FOOD_MEASURE_SELECT,
  });
  return rows.map(toRow);
}

/** Medidas de los alimentos SARA 2 ACTIVOS, agrupadas por foodId y ordenadas (editor). Solo trae los que tienen medidas. */
export async function listMeasuresForPicker(): Promise<Record<string, FoodMeasureRow[]>> {
  const rows = await prisma.foodMeasure.findMany({
    where: { food: { source: "SARA2", active: true } },
    orderBy: [{ foodId: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    select: FOOD_MEASURE_SELECT,
  });
  const out: Record<string, FoodMeasureRow[]> = {};
  for (const r of rows) (out[r.foodId] ??= []).push(toRow(r));
  return out;
}

function validated(input: MeasureInput) {
  const issues = validateMeasure(input);
  if (issues.length > 0) throw new InvalidFoodMeasureError(issues);
  return normalizeMeasureInput(input);
}

/**
 * Valida (validateMeasure → InvalidFoodMeasureError), normaliza y crea al final (order = máx + 1), en
 * transacción. Duplicado por (foodId, nameKey) → DuplicateFoodMeasureError(existente.name); también
 * traduce el P2002 de la base al mismo error. Alimento inexistente → FoodMeasureNotFoundError.
 */
export async function createFoodMeasure(foodId: string, input: MeasureInput): Promise<FoodMeasureRow> {
  const data = validated(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const food = await tx.food.findUnique({ where: { id: foodId }, select: { id: true } });
      if (!food) throw new FoodMeasureNotFoundError("El alimento no existe.");
      const dup = await tx.foodMeasure.findFirst({ where: { foodId, nameKey: data.nameKey }, select: { name: true } });
      if (dup) throw new DuplicateFoodMeasureError(dup.name);
      const last = await tx.foodMeasure.aggregate({ where: { foodId }, _max: { order: true } });
      const order = last._max.order === null ? 0 : last._max.order + 1;
      const created = await tx.foodMeasure.create({
        data: { foodId, name: data.name, nameKey: data.nameKey, plural: data.plural, grams: data.grams, order },
        select: FOOD_MEASURE_SELECT,
      });
      return toRow(created);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw await duplicateFromBase(foodId, data.nameKey, data.name);
    throw err;
  }
}

async function duplicateFromBase(foodId: string, nameKey: string, fallback: string): Promise<DuplicateFoodMeasureError> {
  const existing = await prisma.foodMeasure
    .findFirst({ where: { foodId, nameKey }, select: { name: true } })
    .catch(() => null);
  return new DuplicateFoodMeasureError(existing?.name ?? fallback);
}

/** Igual que create, excluyéndose de la unicidad. No toca ningún ítem (D4). */
export async function updateFoodMeasure(measureId: string, input: MeasureInput): Promise<FoodMeasureRow> {
  const data = validated(input);
  let foodId: string | null = null;
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.foodMeasure.findUnique({ where: { id: measureId }, select: { foodId: true } });
      if (!current) throw new FoodMeasureNotFoundError();
      foodId = current.foodId;
      const dup = await tx.foodMeasure.findFirst({
        where: { foodId: current.foodId, nameKey: data.nameKey, NOT: { id: measureId } },
        select: { name: true },
      });
      if (dup) throw new DuplicateFoodMeasureError(dup.name);
      const updated = await tx.foodMeasure.update({
        where: { id: measureId },
        data: { name: data.name, nameKey: data.nameKey, plural: data.plural, grams: data.grams },
        select: FOOD_MEASURE_SELECT,
      });
      return toRow(updated);
    });
  } catch (err) {
    if (isUniqueViolation(err) && foodId !== null) throw await duplicateFromBase(foodId, data.nameKey, data.name);
    throw err;
  }
}

/** Borra solo esa medida. No toca ningún ítem (D4). Inexistente → FoodMeasureNotFoundError. Devuelve el foodId (para revalidar). */
export async function deleteFoodMeasure(measureId: string): Promise<{ foodId: string }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.foodMeasure.findUnique({ where: { id: measureId }, select: { foodId: true } });
    if (!current) throw new FoodMeasureNotFoundError();
    await tx.foodMeasure.delete({ where: { id: measureId } });
    return { foodId: current.foodId };
  });
}

/** Intercambia `order` con la vecina dentro del alimento. En el borde no hace nada. */
export async function moveFoodMeasure(measureId: string, direction: "up" | "down"): Promise<{ foodId: string }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.foodMeasure.findUnique({ where: { id: measureId }, select: { foodId: true } });
    if (!current) throw new FoodMeasureNotFoundError();
    const list = await tx.foodMeasure.findMany({
      where: { foodId: current.foodId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, order: true },
    });
    const index = list.findIndex((m) => m.id === measureId);
    const target = direction === "up" ? index - 1 : index + 1;
    const a = list[index];
    const b = list[target];
    if (!a || !b) return { foodId: current.foodId };
    // Con órdenes repetidos (no debería pasar) se usan las posiciones: quedan correlativos.
    const orderA = a.order === b.order ? target : b.order;
    const orderB = a.order === b.order ? index : a.order;
    await tx.foodMeasure.update({ where: { id: a.id }, data: { order: orderA } });
    await tx.foodMeasure.update({ where: { id: b.id }, data: { order: orderB } });
    return { foodId: current.foodId };
  });
}

/** Campos de medida de un ítem (los que se copian). */
export interface MeasureItemFields {
  measureQty: number;
  measureName: string;
  measurePlural: string;
  measureGrams: number;
  quantityGrams: number;
}

/**
 * Lee la medida, verifica que sea de `foodId` (si no → FoodMeasureNotFoundError), valida qty con
 * normalizeMeasureQty (si no → RangeError) y arma la copia: name, resolvedMeasurePlural, grams y
 * quantityGrams = measureItemGrams(qty, grams).
 */
export async function resolveMeasureItem(foodId: string, measureId: string, qty: number): Promise<MeasureItemFields> {
  const measure = await prisma.foodMeasure.findUnique({ where: { id: measureId }, select: FOOD_MEASURE_SELECT });
  if (!measure || measure.foodId !== foodId) throw new FoodMeasureNotFoundError();
  const normalized = normalizeMeasureQty(qty);
  if (normalized === null) throw new RangeError("Cantidad de medida casera inválida.");
  const grams = Number(measure.grams);
  return {
    measureQty: normalized,
    measureName: measure.name,
    measurePlural: resolvedMeasurePlural({ name: measure.name, plural: measure.plural }),
    measureGrams: grams,
    quantityGrams: measureItemGrams(normalized, grams),
  };
}
