import {
  atwaterKcal,
  foodNameCompareKey,
  validateOwnFoodMacros,
  type FoodGroupKey,
  type FoodSourceKey,
  type OwnFoodIssue,
} from "@nutri-bot/core";
import { prisma, type Food, type FoodGroup, type FoodSource, type Prisma } from "../index";
import type { TenantRef } from "./tenantScope";

// Base de alimentos (HU-005): SARA 2 (dato oficial, no se edita) + alimentos propios.
// Las kcal de los propios se calculan por Atwater; nunca vienen del formulario.
//
// HU-025 (4.4): todo recibe el consultorio `t`. Un consultorio ve SARA 2 (catálogo común) y SUS propios;
// un propio de otro consultorio es inexistente. "Activo" para el consultorio es la misma regla que la
// función SQL tenant_visible_foods de HU-024: SARA 2 con catalogActive y sin preferencia `visible=false`
// del tenant; propio con `active`. Activar o desactivar un SARA 2 escribe la preferencia del tenant
// (FoodVisibilityPreference), nunca la columna global `active`.

/** Alimentos que el consultorio puede leer (activos o no). */
export function tenantFoodWhere(t: TenantRef): { OR: Prisma.FoodWhereInput[] } {
  return { OR: [{ source: "SARA2" }, { source: "PROPIO", tenantId: t.tenantId }] };
}

/** Alimentos visibles (activos) para el consultorio: misma regla que tenant_visible_foods. */
export function tenantVisibleFoodWhere(t: TenantRef): { OR: Prisma.FoodWhereInput[] } {
  return {
    OR: [
      { source: "SARA2", catalogActive: true, visibility: { none: { tenantId: t.tenantId, visible: false } } },
      { source: "PROPIO", tenantId: t.tenantId, active: true },
    ],
  };
}

/** Un alimento que no es del consultorio (o no existe). Mismo error en los dos casos. */
export class FoodNotFoundError extends Error {
  constructor() {
    super("El alimento no existe.");
    this.name = "FoodNotFoundError";
  }
}

type VisibilityRow = { source: FoodSource; active: boolean; catalogActive: boolean; visibility: { visible: boolean }[] };

/** `active` tal como lo ve el consultorio (la preferencia del tenant manda sobre SARA 2). */
export function activeForTenant(f: VisibilityRow): boolean {
  if (f.source !== "SARA2") return f.active;
  return f.catalogActive && (f.visibility[0]?.visible ?? true);
}

/** `include`/`select` de la preferencia del tenant (para `activeForTenant`). */
export const visibilityFor = (t: TenantRef) => ({ where: { tenantId: t.tenantId }, select: { visible: true }, take: 1 }) as const;

export const FOOD_SUMMARY_SELECT = {
  id: true,
  name: true,
  group: true,
  source: true,
  active: true,
  kcalPer100: true,
  proteinPer100: true,
  carbsPer100: true,
  fatPer100: true,
} satisfies Prisma.FoodSelect;

export type FoodSummary = Prisma.FoodGetPayload<{ select: typeof FOOD_SUMMARY_SELECT }>;

/** Sin el JSON de nutrientes (liviano para ~1000 filas). Orden por nombre. `active` = visible para `t`. */
export async function listFoods(
  t: TenantRef,
  params: { group?: FoodGroup; source?: FoodSource; activeOnly?: boolean } = {},
): Promise<FoodSummary[]> {
  const rows = await prisma.food.findMany({
    where: {
      AND: [params.activeOnly !== false ? tenantVisibleFoodWhere(t) : tenantFoodWhere(t)],
      ...(params.group ? { group: params.group } : {}),
      ...(params.source ? { source: params.source } : {}),
    },
    select: { ...FOOD_SUMMARY_SELECT, catalogActive: true, visibility: visibilityFor(t) },
    orderBy: { name: "asc" },
  });
  return rows.map(({ catalogActive, visibility, ...food }) => ({
    ...food,
    active: activeForTenant({ ...food, catalogActive, visibility }),
  }));
}

/** El alimento si el consultorio lo puede leer (SARA 2 o propio suyo); si no, null. `active` = visible para `t`. */
export async function getFood(t: TenantRef, id: string): Promise<Food | null> {
  const row = await prisma.food.findFirst({
    where: { AND: [{ id }, tenantFoodWhere(t)] },
    include: { visibility: visibilityFor(t) },
  });
  if (!row) return null;
  const { visibility, ...food } = row;
  return { ...food, active: activeForTenant({ ...food, visibility }) };
}

/** Planes y plantillas DISTINTOS del consultorio que tienen al menos un ítem con este alimento. */
export async function getFoodUsage(t: TenantRef, foodId: string): Promise<{ plans: number; templates: number }> {
  const { tenantId } = t;
  const withFood = { meals: { some: { items: { some: { foodId } } } } };
  const [plans, templates] = await Promise.all([
    prisma.nutritionPlan.count({ where: { tenantId, ...withFood } }),
    prisma.planTemplate.count({ where: { tenantId, ...withFood } }),
  ]);
  return { plans, templates };
}

export interface OwnFoodInput {
  name: string;
  group: FoodGroup;
  reference: string | null;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  fiberPer100: number | null;
  alcoholPer100: number | null;
  sodiumMgPer100: number | null;
  addedSugarPer100: number | null;
  saturatedFatPer100: number | null;
  cholesterolMgPer100: number | null;
  /**
   * HU-018d (D9): opcional. El formulario ya no lo manda; sin la clave, guardar NO toca el unitHint
   * guardado (se conserva para el aviso "Tenías anotado" y la conversión a medidas).
   */
  unitHint?: string | null;
}

export class InvalidOwnFoodError extends Error {
  constructor(public readonly issues: OwnFoodIssue[]) {
    super(`Alimento propio inválido: ${issues.join(", ")}`);
    this.name = "InvalidOwnFoodError";
  }
}

export class DuplicateOwnFoodNameError extends Error {
  constructor(public readonly existingId: string) {
    super("Ya existe un alimento propio con ese nombre.");
    this.name = "DuplicateOwnFoodNameError";
  }
}

/** Los alimentos de SARA 2 no se editan (D3): solo se activan/desactivan o se duplican. */
export class FoodNotEditableError extends Error {
  constructor() {
    super("Los alimentos de SARA 2 no se editan.");
    this.name = "FoodNotEditableError";
  }
}

/** Conflictos de nombre por foodNameCompareKey (D12). excludeId = el propio que se edita. */
export async function findFoodNameConflicts(
  t: TenantRef,
  name: string,
  excludeId?: string,
): Promise<{ own: { id: string; name: string } | null; sara: { id: string; name: string } | null }> {
  const key = foodNameCompareKey(name);
  // Propios de OTRO consultorio no cuentan (ni se nombran).
  const all = await prisma.food.findMany({
    where: { AND: [tenantFoodWhere(t), ...(excludeId ? [{ id: { not: excludeId } }] : [])] },
    select: { id: true, name: true, source: true },
    orderBy: { name: "asc" },
  });
  const same = all.filter((f) => foodNameCompareKey(f.name) === key);
  const own = same.find((f) => f.source === "PROPIO");
  const sara = same.find((f) => f.source === "SARA2");
  return {
    own: own ? { id: own.id, name: own.name } : null,
    sara: sara ? { id: sara.id, name: sara.name } : null,
  };
}

function assertValidOwnFood(input: OwnFoodInput) {
  const issues = validateOwnFoodMacros({
    protein: input.proteinPer100,
    carbs: input.carbsPer100,
    fat: input.fatPer100,
    fiber: input.fiberPer100,
    alcohol: input.alcoholPer100,
  });
  if (issues.length > 0) throw new InvalidOwnFoodError(issues);
}

function ownFoodData(input: OwnFoodInput) {
  return {
    name: input.name.trim(),
    group: input.group,
    reference: input.reference?.trim() || null,
    kcalPer100: atwaterKcal({
      protein: input.proteinPer100,
      carbs: input.carbsPer100,
      fat: input.fatPer100,
      alcohol: input.alcoholPer100,
    }),
    proteinPer100: input.proteinPer100,
    carbsPer100: input.carbsPer100,
    fatPer100: input.fatPer100,
    fiberPer100: input.fiberPer100,
    alcoholPer100: input.alcoholPer100,
    sodiumMgPer100: input.sodiumMgPer100,
    addedSugarPer100: input.addedSugarPer100,
    saturatedFatPer100: input.saturatedFatPer100,
    cholesterolMgPer100: input.cholesterolMgPer100,
    ...(input.unitHint !== undefined ? { unitHint: input.unitHint?.trim() || null } : {}),
    groupAutoAssigned: false,
  };
}

/**
 * source PROPIO, kcal = atwaterKcal (nunca del input), sourceKey null, nutrients null,
 * groupAutoAssigned false. Valida validateOwnFoodMacros y el nombre contra otros propios.
 */
export async function createOwnFood(t: TenantRef, input: OwnFoodInput): Promise<Food> {
  assertValidOwnFood(input);
  const { own } = await findFoodNameConflicts(t, input.name);
  if (own) throw new DuplicateOwnFoodNameError(own.id);
  return prisma.food.create({
    data: { ...ownFoodData(input), source: "PROPIO", sourceKey: null, tenantId: t.tenantId },
  });
}

/** Fuente del alimento si el consultorio lo puede leer; si no, FoodNotFoundError. */
async function readableSource(t: TenantRef, id: string): Promise<FoodSource> {
  const current = await prisma.food.findFirst({ where: { AND: [{ id }, tenantFoodWhere(t)] }, select: { source: true } });
  if (!current) throw new FoodNotFoundError();
  return current.source;
}

/** Solo PROPIO del consultorio (SARA 2 → FoodNotEditableError; ajeno o inexistente → FoodNotFoundError).
 *  Recalcula kcal por Atwater (D1) y apaga groupAutoAssigned. */
export async function updateOwnFood(t: TenantRef, id: string, input: OwnFoodInput): Promise<Food> {
  if ((await readableSource(t, id)) !== "PROPIO") throw new FoodNotEditableError();
  assertValidOwnFood(input);
  const { own } = await findFoodNameConflicts(t, input.name, id);
  if (own) throw new DuplicateOwnFoodNameError(own.id);
  return prisma.food.update({ where: { id, source: "PROPIO", tenantId: t.tenantId }, data: ownFoodData(input) });
}

/** Activa o desactiva para el consultorio: SARA 2 → preferencia del tenant; propio suyo → `active`.
 *  Ajeno o inexistente → FoodNotFoundError (sin escribir nada). */
export async function setFoodActive(t: TenantRef, id: string, active: boolean): Promise<void> {
  const { tenantId } = t;
  if ((await readableSource(t, id)) === "SARA2") {
    await prisma.foodVisibilityPreference.upsert({
      where: { tenantId_foodId: { tenantId, foodId: id } },
      create: { tenantId, foodId: id, visible: active },
      update: { visible: active },
    });
    return;
  }
  const { count } = await prisma.food.updateMany({ where: { id, source: "PROPIO", tenantId }, data: { active } });
  if (count !== 1) throw new FoodNotFoundError();
}

/** Solo PROPIO del consultorio: kcalPer100 = atwaterKcal de sus macros guardados ("Usar X kcal", D1). */
export async function applyAtwaterKcal(t: TenantRef, id: string): Promise<Food> {
  const food = await prisma.food.findFirst({ where: { AND: [{ id }, tenantFoodWhere(t)] } });
  if (!food) throw new FoodNotFoundError();
  if (food.source !== "PROPIO") throw new FoodNotEditableError();
  const kcal = atwaterKcal({
    protein: Number(food.proteinPer100),
    carbs: Number(food.carbsPer100),
    fat: Number(food.fatPer100),
    alcohol: food.alcoholPer100 === null ? null : Number(food.alcoholPer100),
  });
  return prisma.food.update({ where: { id, source: "PROPIO", tenantId: t.tenantId }, data: { kcalPer100: kcal } });
}

// El enum de Prisma y las claves de packages/core tienen que ser iguales.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _groupsInSync: Same<FoodGroup, FoodGroupKey> = true;
const _sourcesInSync: Same<FoodSource, FoodSourceKey> = true;
void _groupsInSync;
void _sourcesInSync;
