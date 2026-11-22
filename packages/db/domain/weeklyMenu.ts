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
export type TemplateMealScope = { templateId: string; tenantId: string };

export function templateMealScope({ templateId, tenantId }: TemplateMealScope) {
  return { templateId, template: { tenantId } } satisfies Prisma.TemplateMealWhereInput;
}

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

/** HU-025b-1: un plan siempre se acota por el tenant de quien llama; sin tenant no hay acceso
 *  (MealOwnershipError, igual que un dueño inexistente). Las plantillas sin tenant conservan el camino
 *  legacy de HU-024 hasta 025b-2. */
function planTenant(kind: MealOwnerKind, tenantId: string | undefined): string | undefined {
  if (kind === "plan" && tenantId === undefined) throw new MealOwnershipError();
  return tenantId;
}

function ownedMealWhere(kind: MealOwnerKind, ownerId: string, tenantId?: string) {
  return kind === "plan"
    ? { planId: ownerId, plan: { tenantId: planTenant(kind, tenantId) } }
    : tenantId === undefined ? { templateId: ownerId } : templateMealScope({ templateId: ownerId, tenantId });
}

/** Alcance de una comida suelta (sin el id del dueño): plantilla + tenant, o el tenant del plan. */
export type MealScope = TemplateMealScope | { tenantId: string };

function mealScopeWhere(kind: MealOwnerKind, scope: MealScope | undefined) {
  if (kind === "plan") return { plan: { tenantId: planTenant(kind, scope?.tenantId) } };
  if (!scope) return undefined;
  return "templateId" in scope ? templateMealScope(scope) : { template: { tenantId: scope.tenantId } };
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

async function loadOwnedMeal(kind: MealOwnerKind, tx: Client, ownerId: string, mealId: string, tenantId?: string): Promise<MealWithItems> {
  const { meal } = delegates(kind, tx);
  const found = (await meal.findFirst({
    where: { id: mealId, ...ownedMealWhere(kind, ownerId, tenantId) },
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

function weeklyTemplateScope(kind: MealOwnerKind, templateId: string, tenantId?: string) {
  return kind === "template" && tenantId !== undefined ? { templateId, tenantId } : undefined;
}

function weeklyTransaction<T>(scope: TemplateMealScope | undefined, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return scope ? prisma.$transaction(fn, { isolationLevel: "Serializable" }) : prisma.$transaction(fn);
}

function mealMutationWhere(id: string, scope?: TemplateMealScope) {
  return { id, ...(scope && templateMealScope(scope)) };
}

function itemMutationWhere(mealId: string, scope?: TemplateMealScope) {
  return { mealId, ...(scope && { meal: templateMealScope(scope) }) };
}

async function assertOwnedRecipes(
  tx: Prisma.TransactionClient, kind: MealOwnerKind, ownerId: string, tenantId: string | undefined,
  items: readonly { recipeId?: string | null }[],
) {
  const ids = [...new Set(items.flatMap(({ recipeId }) => recipeId == null ? [] : [recipeId]))];
  if (ids.length === 0) return;
  // For unscoped writers, derive the known owner from persistence; legacy NULL is not membership.
  const query = { where: { id: ownerId }, select: { tenantId: true } } as const;
  const known = tenantId ?? (kind === "plan"
    ? await tx.nutritionPlan.findUnique(query)
    : await tx.planTemplate.findUnique(query))?.tenantId;
  if (known == null) return;
  // Copies can refer to archived recipes. A trusted scope requires exact ownership.
  const ownership = tenantId === undefined ? { OR: [{ tenantId: known }, { tenantId: null }] } : { tenantId };
  const count = await tx.recipe.count({ where: { id: { in: ids }, ...ownership } });
  if (count !== ids.length) throw new RecipeNotAvailableError("La receta no pertenece a este consultorio.");
}

async function createWeeklyItems(
  item: ItemDelegate, rows: (MenuItemData & { mealId: string })[], scope?: TemplateMealScope,
) {
  if (!rows.length) return;
  if (!scope) {
    await item.createMany({ data: rows });
    return;
  }
  for (const { mealId, recipeId, foodId, ...data } of rows) {
    await item.create({ data: {
      ...data,
      meal: { connect: mealMutationWhere(mealId, scope) },
      ...(foodId !== null && { food: { connect: {
        id: foodId,
        OR: [{ source: "SARA2" }, { source: "PROPIO", tenantId: scope.tenantId }],
      } } }),
      ...(recipeId !== null && { recipe: { connect: { id: recipeId, tenantId: scope.tenantId } } }),
    } satisfies Prisma.TemplateMealItemCreateInput });
  }
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
  tenantId?: string,
): Promise<MealSnapshot> {
  const scope = weeklyTemplateScope(kind, ownerId, tenantId);
  return weeklyTransaction(scope, async (tx) => {
    const current = await loadOwnedMeal(kind, tx, ownerId, mealId, tenantId);
    if (scope || (current.mode !== params.mode && params.mode === "PER_DAY")) {
      await assertOwnedRecipes(tx, kind, ownerId, scope?.tenantId, current.items);
    }
    const before = toSnapshot(current);
    if (current.mode === params.mode) return before;
    const { meal, item } = delegates(kind, tx);

    if (params.mode === "PER_DAY") {
      if (current.items.length > 0) {
        await createWeeklyItems(item, copiesTo(mealId, current.items, WEEKDAYS), scope);
        await item.deleteMany({ where: { ...itemMutationWhere(mealId, scope), id: { in: current.items.map((i) => i.id) } } });
      }
      await meal.update({ where: mealMutationWhere(mealId, scope), data: { mode: "PER_DAY", isOptions: false } });
    } else {
      const keep = params.keepWeekday ?? "MON";
      await item.deleteMany({ where: { ...itemMutationWhere(mealId, scope), weekday: { not: keep } } });
      await item.updateMany({ where: { ...itemMutationWhere(mealId, scope), weekday: keep }, data: { weekday: null } });
      await meal.update({ where: mealMutationWhere(mealId, scope), data: { mode: "EVERY_DAY" } });
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
  tenantId?: string,
): Promise<void> {
  const scope = weeklyTemplateScope(kind, ownerId, tenantId);
  return weeklyTransaction(scope, async (tx) => {
    const current = await loadOwnedMeal(kind, tx, ownerId, mealId, tenantId);
    if (isOptions && current.mode === "PER_DAY") {
      throw new MealModeError("Las opciones solo valen en comidas iguales todos los días.");
    }
    await delegates(kind, tx).meal.update({ where: mealMutationWhere(mealId, scope), data: { isOptions } });
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
  tenantId?: string,
): Promise<MealSnapshot[]> {
  assertValidCopyTargets(params.from, params.to);
  const scope = weeklyTemplateScope(kind, ownerId, tenantId);
  return weeklyTransaction(scope, async (tx) => {
    if (scope && !(await tx.planTemplate.findUnique({
      where: { id: ownerId, tenantId: scope.tenantId }, select: { id: true },
    }))) throw new MealOwnershipError();
    // HU-025: un plan de otro consultorio (o inexistente) no se toca.
    if (kind === "plan" && !(await tx.nutritionPlan.findUnique({
      where: { id: ownerId, tenantId: planTenant(kind, tenantId) }, select: { id: true },
    }))) throw new MealOwnershipError();
    const { meal, item } = delegates(kind, tx);
    const meals = (await meal.findMany({
      where: { ...ownedMealWhere(kind, ownerId, tenantId), mode: "PER_DAY" },
      orderBy: { order: "asc" },
      include: { items: { orderBy: itemsOrder } },
    })) as MealWithItems[];
    await assertOwnedRecipes(tx, kind, ownerId, scope?.tenantId,
      meals.flatMap((m) => scope ? m.items : m.items.filter((i) => i.weekday === params.from)));
    for (const m of meals) {
      await item.deleteMany({ where: { ...itemMutationWhere(m.id, scope), weekday: { in: params.to } } });
      const source = m.items.filter((i) => i.weekday === params.from);
      await createWeeklyItems(item, copiesTo(m.id, source, params.to), scope);
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
  tenantId?: string,
): Promise<MealSnapshot> {
  const to = WEEKDAYS.filter((d) => d !== from);
  assertValidCopyTargets(from, to);
  const scope = weeklyTemplateScope(kind, ownerId, tenantId);
  return weeklyTransaction(scope, async (tx) => {
    const current = await loadOwnedMeal(kind, tx, ownerId, mealId, tenantId);
    const source = current.items.filter((i) => i.weekday === from);
    if (scope) await assertOwnedRecipes(tx, kind, ownerId, scope.tenantId, current.items);
    if (current.mode !== "PER_DAY") throw new MealModeError("Solo se repiten comidas que cambian cada día.");
    if (!scope) await assertOwnedRecipes(tx, kind, ownerId, undefined, source);
    const { item } = delegates(kind, tx);
    await item.deleteMany({ where: { ...itemMutationWhere(mealId, scope), weekday: { in: to } } });
    await createWeeklyItems(item, copiesTo(mealId, source, to), scope);
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
  tenantId?: string,
): Promise<void> {
  snapshots.forEach(assertSnapshotInvariants);
  const scope = weeklyTemplateScope(kind, ownerId, tenantId);
  return weeklyTransaction(scope, async (tx) => {
    const { meal, item } = delegates(kind, tx);
    const ids = [...new Set(snapshots.map((s) => s.mealId))];
    if (ids.length !== snapshots.length) throw new MealModeError("Fotos repetidas.");
    if (ids.length === 0) return;
    const owned = await meal.count({ where: { id: { in: ids }, ...ownedMealWhere(kind, ownerId, tenantId) } });
    if (owned !== ids.length) throw new MealOwnershipError();
    await assertOwnedRecipes(tx, kind, ownerId, scope?.tenantId, snapshots.flatMap((s) => s.items));
    for (const s of snapshots) {
      await item.deleteMany({ where: itemMutationWhere(s.mealId, scope) });
      await meal.update({ where: mealMutationWhere(s.mealId, scope), data: { mode: s.mode, isOptions: s.isOptions } });
      await createWeeklyItems(item, s.items.map((i) => ({ mealId: s.mealId, ...itemCopyData(i), order: i.order, weekday: i.weekday })), scope);
    }
  });
}

/** Renombrar una comida (1..60 caracteres, trim). */
export async function renameMeal(kind: MealOwnerKind, ownerId: string, mealId: string, name: string, tenantId?: string): Promise<void> {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 60) throw new RangeError("El nombre tiene que tener entre 1 y 60 caracteres.");
  const scope = weeklyTemplateScope(kind, ownerId, tenantId);
  return weeklyTransaction(scope, async (tx) => {
    await loadOwnedMeal(kind, tx, ownerId, mealId, tenantId);
    await delegates(kind, tx).meal.update({ where: mealMutationWhere(mealId, scope), data: { name: trimmed } });
  });
}

/** Subir/bajar una comida: intercambia `order` con la vecina. En el borde no hace nada. */
export function moveMeal(
  kind: MealOwnerKind,
  ownerId: string,
  mealId: string,
  direction: "up" | "down",
  tenantId?: string,
): Promise<void> {
  const scope = weeklyTemplateScope(kind, ownerId, tenantId);
  return weeklyTransaction(scope, async (tx) => {
    const current = await loadOwnedMeal(kind, tx, ownerId, mealId, tenantId);
    const { meal } = delegates(kind, tx);
    const neighbor = (await meal.findFirst({
      where: { ...ownedMealWhere(kind, ownerId, tenantId), order: direction === "up" ? { lt: current.order } : { gt: current.order } },
      orderBy: { order: direction === "up" ? "desc" : "asc" },
    })) as MealRow | null;
    if (!neighbor) return;
    await meal.update({ where: mealMutationWhere(current.id, scope), data: { order: neighbor.order } });
    await meal.update({ where: mealMutationWhere(neighbor.id, scope), data: { order: current.order } });
  });
}

/** Siguiente `order` libre dentro de (mealId, weekday). */
export async function nextItemOrder(
  kind: MealOwnerKind, mealId: string, weekday: Weekday | null, scope?: MealScope,
): Promise<number> {
  const meal = mealScopeWhere(kind, scope);
  const last = (await delegates(kind, prisma).item.findFirst({
    where: { mealId, weekday, ...(meal && { meal }) },
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
  scope?: MealScope,
): Promise<void> {
  const found = (await delegates(kind, prisma).meal.findUnique({
    where: { id: mealId, ...mealScopeWhere(kind, scope) },
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
  tenantId?: string,
): Promise<{ mode: MealMode; isOptions: boolean }> {
  const { meal } = delegates(kind, prisma);
  const owner = ownedMealWhere(kind, ownerId, tenantId);
  const mode = data.mode ?? ((await meal.count({ where: { ...owner, mode: "PER_DAY" } })) > 0 ? "PER_DAY" : "EVERY_DAY");
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
  tenantId?: string,
): Promise<{ itemIds: string[] }> {
  const portions = assertPortions(params.portions ?? 1);
  const recipeWhere = { id: params.recipeId, ...(tenantId !== undefined && { tenantId, status: "PUBLISHED" as const }) };
  const add = async (tx: Prisma.TransactionClient) => {
    const current = await loadOwnedMeal(kind, tx, ownerId, params.mealId, tenantId);
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
    const recipe = (await tx.recipe.findUnique({ where: recipeWhere, select: { status: true } })) as
      | { status: string }
      | null;
    if (recipe?.status !== "PUBLISHED") throw new RecipeNotAvailableError();
    if (tenantId === undefined) await assertOwnedRecipes(tx, kind, ownerId, undefined, [params]);

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
          ...(tenantId === undefined
            ? { mealId: params.mealId, recipeId: params.recipeId, foodId: null }
            : {
                meal: { connect: { id: params.mealId, ...ownedMealWhere(kind, ownerId, tenantId) } },
                recipe: { connect: recipeWhere },
              }),
          portions,
          weekday,
          order: last ? last.order + 1 : 0,
          quantityGrams: null,
          customLabel: null,
          notes: null,
        },
        select: { id: true },
      })) as { id: string };
      itemIds.push(created.id);
    }
    return { itemIds };
  };
  return tenantId === undefined
    ? prisma.$transaction(add)
    : prisma.$transaction(add, { isolationLevel: "Serializable" });
}

/** Cambia las porciones de UN ítem de receta del dueño. */
export async function setRecipeItemPortions(
  kind: MealOwnerKind,
  ownerId: string,
  itemId: string,
  portions: number,
  tenantId?: string,
): Promise<void> {
  const value = assertPortions(portions);
  const { item } = delegates(kind, prisma);
  const where = { id: itemId, recipeId: { not: null }, meal: ownedMealWhere(kind, ownerId, tenantId) };
  if (tenantId !== undefined) {
    const { count } = (await item.updateMany({ where, data: { portions: value } })) as { count: number };
    if (count !== 0) return;
  } else {
    const found = await item.findFirst({ where, select: { id: true } });
    if (found) {
      await item.update({ where: { id: itemId }, data: { portions: value } });
      return;
    }
  }
  throw new MealOwnershipError("El ítem de receta no pertenece a este plan o plantilla.");
}

/**
 * HU-018d (D10): stepper. Cambia la cantidad de UN ítem en medida casera del dueño y recalcula
 * quantityGrams con los gramos COPIADOS en el ítem (no los de la medida actual, D4).
 */
export async function setMeasureItemQuantity(
  kind: MealOwnerKind,
  ownerId: string,
  itemId: string,
  qty: number,
  tenantId?: string,
): Promise<{ quantityGrams: number }> {
  const value = normalizeMeasureQty(qty);
  if (value === null) throw new RangeError("La cantidad va de ¼ a 20, de a ¼.");
  const { item } = delegates(kind, prisma);
  const scope = weeklyTemplateScope(kind, ownerId, tenantId);
  const where = { id: itemId, measureName: { not: null }, meal: ownedMealWhere(kind, ownerId, tenantId) };
  const notOwned = () => new MealOwnershipError("El ítem en medida casera no pertenece a este plan o plantilla.");
  const found = (await item.findFirst({
    where,
    select: { id: true, measureGrams: true },
  })) as { id: string; measureGrams: { toString(): string } | null } | null;
  if (!found || found.measureGrams === null) throw notOwned();
  const quantityGrams = measureItemGrams(value, Number(found.measureGrams.toString()));
  const data = { measureQty: value, quantityGrams };
  if (scope) {
    const result = (await item.updateMany({ where, data })) as { count: number };
    if (result.count === 0) throw notOwned();
  } else {
    await item.update({ where: { id: itemId }, data });
  }
  return { quantityGrams };
}

/** "Deshacer" de "Agregar" y "Quitar" de la tarjeta: borra SOLO esos ids y solo si son del dueño. */
export async function removeMenuItems(kind: MealOwnerKind, ownerId: string, itemIds: string[], tenantId?: string): Promise<number> {
  if (itemIds.length < 1 || itemIds.length > 50) throw new RangeError("Entre 1 y 50 ítems.");
  const { item } = delegates(kind, prisma);
  const result = (await item.deleteMany({
    where: {
      id: { in: itemIds },
      ...(tenantId !== undefined && { recipeId: { not: null } }),
      meal: ownedMealWhere(kind, ownerId, tenantId),
    },
  })) as { count: number };
  return result.count;
}
