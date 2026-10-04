/**
 * HU-018b: operaciones del menú semanal, parametrizadas por dueño (plan o plantilla) para no
 * duplicar el código. Las invariantes del modelo las asegura este archivo, no la base:
 *   1. Comida EVERY_DAY → todos sus ítems con weekday = null.
 *   2. Comida PER_DAY → todos sus ítems con weekday != null, e isOptions = false.
 *   3. `order` es correlativo dentro de cada (mealId, weekday).
 * Todas las escrituras van en `prisma.$transaction`.
 */
import {
  DEFAULT_WEEKLY_MEALS,
  MEASURE_GRAMS_MAX,
  MEASURE_GRAMS_MIN,
  WEEKDAYS,
  measureItemGrams,
  normalizeMeasureQty,
  normalizePortions,
} from "@nutri-bot/core";
import { prisma, type MealMode, type Prisma, type Weekday } from "../index";

export type MealOwnerKind = "plan" | "template";

/** Un ítem tal como se copia o se restaura. HU-018c: + recipeId y portions. HU-018d: + medida casera. */
export interface MenuItemData {
  foodId: string | null;
  customLabel: string | null;
  quantityGrams: number | null;
  notes: string | null;
  order: number;
  weekday: Weekday | null;
  /** HU-018c: ítem de receta (con receta, foodId y quantityGrams van en null). */
  recipeId: string | null;
  /** HU-018c: porciones de la receta (null si no es receta). */
  portions: number | null;
  /** HU-018d: medida casera (las 4 juntas o ninguna; copias de la FoodMeasure al agregar, D4). */
  measureQty: number | null;
  measureName: string | null;
  measurePlural: string | null;
  measureGrams: number | null;
}

/** Foto completa de una comida (todos sus días) para "Deshacer". */
export interface MealSnapshot {
  mealId: string;
  mode: MealMode;
  isOptions: boolean;
  items: MenuItemData[];
}

/** La comida no es de ese plan/plantilla (o no existe). */
export class MealOwnershipError extends Error {
  constructor(message = "La comida no pertenece a este plan o plantilla.") {
    super(message);
    this.name = "MealOwnershipError";
  }
}
/** weekday no coincide con el modo de la comida. */
export class MealWeekdayMismatchError extends Error {
  constructor(message = "El día no coincide con el modo de la comida.") {
    super(message);
    this.name = "MealWeekdayMismatchError";
  }
}
/** Operación inválida para el modo de la comida (p. ej. opciones en una comida PER_DAY). */
export class MealModeError extends Error {
  constructor(message = "La operación no vale para el modo de la comida.") {
    super(message);
    this.name = "MealModeError";
  }
}

// ─── Delegados comunes a plan y plantilla ────────────────────────────────────────

interface ItemRow {
  id: string;
  mealId: string;
  foodId: string | null;
  customLabel: string | null;
  quantityGrams: { toString(): string } | null;
  notes: string | null;
  order: number;
  weekday: Weekday | null;
  recipeId: string | null;
  portions: { toString(): string } | null;
  measureQty: { toString(): string } | null;
  measureName: string | null;
  measurePlural: string | null;
  measureGrams: { toString(): string } | null;
}
interface MealRow {
  id: string;
  name: string;
  order: number;
  mode: MealMode;
  isOptions: boolean;
}
type MealWithItems = MealRow & { items: ItemRow[] };

/* eslint-disable @typescript-eslint/no-explicit-any -- interfaz mínima común a los dos delegados de Prisma */
interface MealDelegate {
  findFirst(args: any): Promise<any>;
  findMany(args: any): Promise<any[]>;
  findUnique(args: any): Promise<any>;
  update(args: any): Promise<unknown>;
  createMany(args: any): Promise<unknown>;
  count(args: any): Promise<number>;
}
interface ItemDelegate {
  findFirst(args: any): Promise<any>;
  findMany(args: any): Promise<any[]>;
  create(args: any): Promise<any>;
  update(args: any): Promise<unknown>;
  createMany(args: any): Promise<unknown>;
  deleteMany(args: any): Promise<unknown>;
  updateMany(args: any): Promise<unknown>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

type Client = Prisma.TransactionClient | typeof prisma;

function delegates(kind: MealOwnerKind, tx: Client): {
  meal: MealDelegate;
  item: ItemDelegate;
  ownerKey: "planId" | "templateId";
} {
  return kind === "plan"
    ? { meal: tx.planMeal as unknown as MealDelegate, item: tx.planMealItem as unknown as ItemDelegate, ownerKey: "planId" }
    : { meal: tx.templateMeal as unknown as MealDelegate, item: tx.templateMealItem as unknown as ItemDelegate, ownerKey: "templateId" };
}

const itemsOrder = [{ weekday: "asc" as const }, { order: "asc" as const }];

/**
 * Único lugar que lista los campos que se copian de un ítem (HU-018c: + recipeId y portions;
 * HU-018d: + los cuatro de la medida casera).
 */
function itemCopyData(
  item: Pick<ItemRow, "foodId" | "customLabel" | "notes"> & {
    quantityGrams: unknown;
    recipeId?: string | null;
    portions?: unknown;
    measureQty?: unknown;
    measureName?: string | null;
    measurePlural?: string | null;
    measureGrams?: unknown;
  },
): Omit<MenuItemData, "weekday" | "order"> {
  return {
    foodId: item.foodId,
    customLabel: item.customLabel,
    quantityGrams: item.quantityGrams == null ? null : Number(item.quantityGrams),
    notes: item.notes,
    recipeId: item.recipeId ?? null,
    portions: item.portions == null ? null : Number(item.portions),
    measureQty: item.measureQty == null ? null : Number(item.measureQty),
    measureName: item.measureName ?? null,
    measurePlural: item.measurePlural ?? null,
    measureGrams: item.measureGrams == null ? null : Number(item.measureGrams),
  };
}

function toSnapshot(meal: MealWithItems): MealSnapshot {
  return {
    mealId: meal.id,
    mode: meal.mode,
    isOptions: meal.isOptions,
    items: meal.items.map((item) => ({ ...itemCopyData(item), order: item.order, weekday: item.weekday })),
  };
}

async function loadOwnedMeal(kind: MealOwnerKind, tx: Client, ownerId: string, mealId: string): Promise<MealWithItems> {
  const { meal, ownerKey } = delegates(kind, tx);
  const found = (await meal.findFirst({
    where: { id: mealId, [ownerKey]: ownerId },
    include: { items: { orderBy: itemsOrder } },
  })) as MealWithItems | null;
  if (!found) throw new MealOwnershipError();
  return found;
}

/** Copias de `items` en cada día de `days` (mismo order). */
function copiesTo(mealId: string, items: readonly ItemRow[], days: readonly (Weekday | null)[]) {
  return days.flatMap((weekday) => items.map((item) => ({ mealId, ...itemCopyData(item), order: item.order, weekday })));
}

function assertValidCopyTargets(from: Weekday, to: readonly Weekday[]) {
  const valid = to.length >= 1 && to.length <= 6 && new Set(to).size === to.length &&
    !to.includes(from) && [from, ...to].every((d) => (WEEKDAYS as readonly string[]).includes(d));
  if (!valid) throw new MealModeError("Los días de destino no son válidos.");
}

// ─── Operaciones ────────────────────────────────────────────────────────────────

/** Crea DEFAULT_WEEKLY_MEALS (core) para un dueño recién creado, dentro de la transacción dada. */
export async function createDefaultWeeklyMeals(
  tx: Prisma.TransactionClient,
  kind: MealOwnerKind,
  ownerId: string,
): Promise<void> {
  const { meal, ownerKey } = delegates(kind, tx);
  await meal.createMany({
    data: DEFAULT_WEEKLY_MEALS.map((m, order) => ({
      [ownerKey]: ownerId, name: m.name, order, mode: m.mode, isOptions: m.isOptions,
    })),
  });
}

/**
 * Cambia el modo. Devuelve la foto ANTERIOR de la comida (para Deshacer).
 * EVERY_DAY → PER_DAY: cada ítem se copia a los 7 días (mismo order), se borra el original y
 * isOptions pasa a false. PER_DAY → EVERY_DAY: se conservan los ítems de `keepWeekday` (default MON)
 * con weekday = null y se borran los de los otros días. Mismo modo → no hace nada.
 */
export function setMealMode(
  kind: MealOwnerKind,
  ownerId: string,
  mealId: string,
  params: { mode: MealMode; keepWeekday?: Weekday },
): Promise<MealSnapshot> {
  return prisma.$transaction(async (tx) => {
    const current = await loadOwnedMeal(kind, tx, ownerId, mealId);
    const before = toSnapshot(current);
    if (current.mode === params.mode) return before;
    const { meal, item } = delegates(kind, tx);

    if (params.mode === "PER_DAY") {
      if (current.items.length > 0) {
        await item.createMany({ data: copiesTo(mealId, current.items, WEEKDAYS) });
        await item.deleteMany({ where: { mealId, id: { in: current.items.map((i) => i.id) } } });
      }
      await meal.update({ where: { id: mealId }, data: { mode: "PER_DAY", isOptions: false } });
    } else {
      const keep = params.keepWeekday ?? "MON";
      await item.deleteMany({ where: { mealId, weekday: { not: keep } } });
      await item.updateMany({ where: { mealId, weekday: keep }, data: { weekday: null } });
      await meal.update({ where: { id: mealId }, data: { mode: "EVERY_DAY" } });
    }
    return before;
  });
}

/** Prende/apaga "Opciones (elige una)". En una comida PER_DAY, isOptions = true → MealModeError. */
export function setMealOptions(
  kind: MealOwnerKind,
  ownerId: string,
  mealId: string,
  isOptions: boolean,
): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const current = await loadOwnedMeal(kind, tx, ownerId, mealId);
    if (isOptions && current.mode === "PER_DAY") {
      throw new MealModeError("Las opciones solo valen en comidas iguales todos los días.");
    }
    await delegates(kind, tx).meal.update({ where: { id: mealId }, data: { isOptions } });
  });
}

/**
 * "Copiar este día a…": en cada comida PER_DAY del dueño, borra los ítems de los días `to` y copia
 * los de `from` a cada uno. Las comidas EVERY_DAY no se tocan. Devuelve las fotos ANTERIORES.
 */
export async function copyDay(
  kind: MealOwnerKind,
  ownerId: string,
  params: { from: Weekday; to: Weekday[] },
): Promise<MealSnapshot[]> {
  assertValidCopyTargets(params.from, params.to);
  return prisma.$transaction(async (tx) => {
    const { meal, item, ownerKey } = delegates(kind, tx);
    const meals = (await meal.findMany({
      where: { [ownerKey]: ownerId, mode: "PER_DAY" },
      orderBy: { order: "asc" },
      include: { items: { orderBy: itemsOrder } },
    })) as MealWithItems[];
    for (const m of meals) {
      await item.deleteMany({ where: { mealId: m.id, weekday: { in: params.to } } });
      const source = m.items.filter((i) => i.weekday === params.from);
      if (source.length > 0) await item.createMany({ data: copiesTo(m.id, source, params.to) });
    }
    return meals.map(toSnapshot);
  });
}

/** "Repetir en todos los días": copia los ítems de `from` de UNA comida PER_DAY a los otros 6 días. */
export async function repeatMealInAllDays(
  kind: MealOwnerKind,
  ownerId: string,
  mealId: string,
  from: Weekday,
): Promise<MealSnapshot> {
  const to = WEEKDAYS.filter((d) => d !== from);
  assertValidCopyTargets(from, to);
  return prisma.$transaction(async (tx) => {
    const current = await loadOwnedMeal(kind, tx, ownerId, mealId);
    if (current.mode !== "PER_DAY") throw new MealModeError("Solo se repiten comidas que cambian cada día.");
    const { item } = delegates(kind, tx);
    await item.deleteMany({ where: { mealId, weekday: { in: to } } });
    const source = current.items.filter((i) => i.weekday === from);
    if (source.length > 0) await item.createMany({ data: copiesTo(mealId, source, to) });
    return toSnapshot(current);
  });
}

function assertSnapshotInvariants(snapshot: MealSnapshot) {
  if (snapshot.mode === "PER_DAY") {
    if (snapshot.isOptions || snapshot.items.some((i) => i.weekday === null)) throw new MealModeError();
  } else if (snapshot.items.some((i) => i.weekday !== null)) {
    throw new MealModeError();
  }
  // HU-018c (invariantes 3-1 y 3-2): receta ⇒ sin alimento ni gramos y con porciones válidas;
  // sin receta ⇒ sin porciones.
  for (const i of snapshot.items) {
    const recipeId = i.recipeId ?? null;
    const portions = i.portions ?? null;
    if (recipeId !== null) {
      if (i.foodId !== null || i.quantityGrams !== null || portions === null || normalizePortions(portions) === null) {
        throw new MealModeError("Un ítem de receta no lleva alimento ni gramos, y sí porciones.");
      }
    } else if (portions !== null) {
      throw new MealModeError("Solo un ítem de receta lleva porciones.");
    }
    assertMeasureInvariants(i);
  }
}

const MEASURE_ERROR = "Un ítem en medida casera lleva alimento, cantidad válida y sus gramos.";

/** HU-018d (M1 y M2): las 4 columnas de medida juntas, solo con alimento y con gramos coherentes. */
function assertMeasureInvariants(i: MenuItemData) {
  const values = [i.measureQty ?? null, i.measureName ?? null, i.measurePlural ?? null, i.measureGrams ?? null];
  const present = values.filter((v) => v !== null).length;
  if (present === 0) return;
  if (present !== 4) throw new MealModeError(MEASURE_ERROR);
  const qty = i.measureQty as number;
  const grams = i.measureGrams as number;
  const ok =
    i.foodId !== null &&
    (i.recipeId ?? null) === null &&
    (i.portions ?? null) === null &&
    i.customLabel === null &&
    normalizeMeasureQty(qty) !== null &&
    grams >= MEASURE_GRAMS_MIN &&
    grams <= MEASURE_GRAMS_MAX &&
    i.quantityGrams !== null &&
    Math.abs(i.quantityGrams - measureItemGrams(qty, grams)) <= 0.01;
  if (!ok) throw new MealModeError(MEASURE_ERROR);
}

/**
 * Deshacer: verifica que todas las comidas sean del dueño (si no, no escribe nada), y para cada
 * foto borra TODOS los ítems de la comida, restaura mode/isOptions y recrea los ítems.
 */
export async function restoreMealSnapshots(
  kind: MealOwnerKind,
  ownerId: string,
  snapshots: MealSnapshot[],
): Promise<void> {
  snapshots.forEach(assertSnapshotInvariants);
  return prisma.$transaction(async (tx) => {
    const { meal, item, ownerKey } = delegates(kind, tx);
    const ids = [...new Set(snapshots.map((s) => s.mealId))];
    if (ids.length !== snapshots.length) throw new MealModeError("Fotos repetidas.");
    if (ids.length === 0) return;
    const owned = await meal.count({ where: { id: { in: ids }, [ownerKey]: ownerId } });
    if (owned !== ids.length) throw new MealOwnershipError();
    for (const s of snapshots) {
      await item.deleteMany({ where: { mealId: s.mealId } });
      await meal.update({ where: { id: s.mealId }, data: { mode: s.mode, isOptions: s.isOptions } });
      if (s.items.length > 0) {
        await item.createMany({
          data: s.items.map((i) => ({ mealId: s.mealId, ...itemCopyData(i), order: i.order, weekday: i.weekday })),
        });
      }
    }
  });
}

/** Renombrar una comida (1..60 caracteres, trim). */
export async function renameMeal(kind: MealOwnerKind, ownerId: string, mealId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 60) throw new RangeError("El nombre tiene que tener entre 1 y 60 caracteres.");
  return prisma.$transaction(async (tx) => {
    await loadOwnedMeal(kind, tx, ownerId, mealId);
    await delegates(kind, tx).meal.update({ where: { id: mealId }, data: { name: trimmed } });
  });
}

/** Subir/bajar una comida: intercambia `order` con la vecina. En el borde no hace nada. */
export function moveMeal(
  kind: MealOwnerKind,
  ownerId: string,
  mealId: string,
  direction: "up" | "down",
): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const current = await loadOwnedMeal(kind, tx, ownerId, mealId);
    const { meal, ownerKey } = delegates(kind, tx);
    const neighbor = (await meal.findFirst({
      where: { [ownerKey]: ownerId, order: direction === "up" ? { lt: current.order } : { gt: current.order } },
      orderBy: { order: direction === "up" ? "desc" : "asc" },
    })) as MealRow | null;
    if (!neighbor) return;
    await meal.update({ where: { id: current.id }, data: { order: neighbor.order } });
    await meal.update({ where: { id: neighbor.id }, data: { order: current.order } });
  });
}

/** Siguiente `order` libre dentro de (mealId, weekday). */
export async function nextItemOrder(kind: MealOwnerKind, mealId: string, weekday: Weekday | null): Promise<number> {
  const last = (await delegates(kind, prisma).item.findFirst({
    where: { mealId, weekday },
    orderBy: { order: "desc" },
    select: { order: true },
  })) as { order: number } | null;
  return last ? last.order + 1 : 0;
}

/**
 * Valida weekday contra el modo de la comida: EVERY_DAY exige null; PER_DAY exige un día.
 * Tira MealWeekdayMismatchError (o MealOwnershipError si la comida no existe).
 */
export async function assertWeekdayMatchesMeal(
  kind: MealOwnerKind,
  mealId: string,
  weekday: Weekday | null,
): Promise<void> {
  const found = (await delegates(kind, prisma).meal.findUnique({
    where: { id: mealId },
    select: { mode: true },
  })) as { mode: MealMode } | null;
  if (!found) throw new MealOwnershipError("La comida no existe.");
  if (found.mode === "EVERY_DAY" && weekday !== null) {
    throw new MealWeekdayMismatchError("Una comida igual todos los días no lleva día.");
  }
  if (found.mode === "PER_DAY" && weekday === null) {
    throw new MealWeekdayMismatchError("Una comida que cambia cada día necesita el día.");
  }
}

/** Modo de una comida nueva si no se indica (12-D3): PER_DAY si el dueño ya es semanal. */
export async function resolveNewMealMode(
  kind: MealOwnerKind,
  ownerId: string,
  data: { mode?: MealMode; isOptions?: boolean },
): Promise<{ mode: MealMode; isOptions: boolean }> {
  const { meal, ownerKey } = delegates(kind, prisma);
  const mode = data.mode ?? ((await meal.count({ where: { [ownerKey]: ownerId, mode: "PER_DAY" } })) > 0 ? "PER_DAY" : "EVERY_DAY");
  const isOptions = data.isOptions ?? false;
  if (isOptions && mode === "PER_DAY") throw new MealModeError("Las opciones solo valen en comidas iguales todos los días.");
  return { mode, isOptions };
}

// ─── HU-018c: ítems de receta ────────────────────────────────────────────────────

/** La receta no existe o no está PUBLISHED (D13). */
export class RecipeNotAvailableError extends Error {
  constructor(message = "La receta no está publicada.") {
    super(message);
    this.name = "RecipeNotAvailableError";
  }
}

function assertPortions(portions: number): number {
  const value = normalizePortions(portions);
  if (value === null) throw new RangeError("Las porciones van de ½ en ½, entre ½ y 4.");
  return value;
}

/**
 * Agrega `portions` (default 1) de una receta PUBLISHED a una comida, en uno o varios días, en UNA
 * transacción. EVERY_DAY → weekdays null; PER_DAY → 1..7 días distintos. Cada ítem va al final de su
 * (mealId, weekday). Devuelve los ids creados en el orden de WEEKDAYS (para "Deshacer").
 */
export async function addRecipeItems(
  kind: MealOwnerKind,
  ownerId: string,
  params: { mealId: string; recipeId: string; portions?: number; weekdays: Weekday[] | null },
): Promise<{ itemIds: string[] }> {
  const portions = assertPortions(params.portions ?? 1);
  return prisma.$transaction(async (tx) => {
    const current = await loadOwnedMeal(kind, tx, ownerId, params.mealId);
    let days: (Weekday | null)[];
    if (current.mode === "EVERY_DAY") {
      if (params.weekdays !== null) throw new MealWeekdayMismatchError("Una comida igual todos los días no lleva día.");
      days = [null];
    } else {
      const w = params.weekdays;
      const valid = w !== null && w.length >= 1 && w.length <= 7 && new Set(w).size === w.length &&
        w.every((d) => (WEEKDAYS as readonly string[]).includes(d));
      if (!valid) throw new MealWeekdayMismatchError("Una comida que cambia cada día necesita días válidos.");
      days = WEEKDAYS.filter((d) => w.includes(d));
    }
    const recipe = (await tx.recipe.findUnique({ where: { id: params.recipeId }, select: { status: true } })) as
      | { status: string }
      | null;
    if (recipe?.status !== "PUBLISHED") throw new RecipeNotAvailableError();

    const { item } = delegates(kind, tx);
    const itemIds: string[] = [];
    for (const weekday of days) {
      const last = (await item.findFirst({
        where: { mealId: params.mealId, weekday },
        orderBy: { order: "desc" },
        select: { order: true },
      })) as { order: number } | null;
      const created = (await item.create({
        data: {
          mealId: params.mealId,
          recipeId: params.recipeId,
          portions,
          weekday,
          order: last ? last.order + 1 : 0,
          foodId: null,
          quantityGrams: null,
          customLabel: null,
          notes: null,
        },
        select: { id: true },
      })) as { id: string };
      itemIds.push(created.id);
    }
    return { itemIds };
  });
}

/** Cambia las porciones de UN ítem de receta del dueño. */
export async function setRecipeItemPortions(
  kind: MealOwnerKind,
  ownerId: string,
  itemId: string,
  portions: number,
): Promise<void> {
  const value = assertPortions(portions);
  const { item, ownerKey } = delegates(kind, prisma);
  const found = await item.findFirst({
    where: { id: itemId, recipeId: { not: null }, meal: { [ownerKey]: ownerId } },
    select: { id: true },
  });
  if (!found) throw new MealOwnershipError("El ítem de receta no pertenece a este plan o plantilla.");
  await item.update({ where: { id: itemId }, data: { portions: value } });
}

/** "Deshacer" de "Agregar" y "Quitar" de la tarjeta: borra SOLO esos ids y solo si son del dueño. */
export async function removeMenuItems(kind: MealOwnerKind, ownerId: string, itemIds: string[]): Promise<number> {
  if (itemIds.length < 1 || itemIds.length > 50) throw new RangeError("Entre 1 y 50 ítems.");
  const { item, ownerKey } = delegates(kind, prisma);
  const result = (await item.deleteMany({ where: { id: { in: itemIds }, meal: { [ownerKey]: ownerId } } })) as { count: number };
  return result.count;
}
