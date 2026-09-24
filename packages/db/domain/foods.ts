import {
  atwaterKcal,
  foodNameCompareKey,
  validateOwnFoodMacros,
  type FoodGroupKey,
  type FoodSourceKey,
  type OwnFoodIssue,
} from "@nutri-bot/core";
import { prisma, type Food, type FoodGroup, type FoodSource, type Prisma } from "../index";

// Base de alimentos (HU-005): SARA 2 (dato oficial, no se edita) + alimentos propios.
// Las kcal de los propios se calculan por Atwater; nunca vienen del formulario.

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

/** Sin el JSON de nutrientes (liviano para ~1000 filas). Orden por nombre. */
export function listFoods(
  params: { group?: FoodGroup; source?: FoodSource; activeOnly?: boolean } = {},
): Promise<FoodSummary[]> {
  return prisma.food.findMany({
    where: {
      ...(params.group ? { group: params.group } : {}),
      ...(params.source ? { source: params.source } : {}),
      ...(params.activeOnly !== false ? { active: true } : {}),
    },
    select: FOOD_SUMMARY_SELECT,
    orderBy: { name: "asc" },
  });
}

export function getFood(id: string): Promise<Food | null> {
  return prisma.food.findUnique({ where: { id } });
}

/** Planes y plantillas DISTINTOS que tienen al menos un ítem con este alimento. */
export async function getFoodUsage(foodId: string): Promise<{ plans: number; templates: number }> {
  const [plans, templates] = await Promise.all([
    prisma.nutritionPlan.count({ where: { meals: { some: { items: { some: { foodId } } } } } }),
    prisma.planTemplate.count({ where: { meals: { some: { items: { some: { foodId } } } } } }),
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
  unitHint: string | null;
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
  name: string,
  excludeId?: string,
): Promise<{ own: { id: string; name: string } | null; sara: { id: string; name: string } | null }> {
  const key = foodNameCompareKey(name);
  const all = await prisma.food.findMany({
    where: excludeId ? { id: { not: excludeId } } : {},
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
    unitHint: input.unitHint?.trim() || null,
    groupAutoAssigned: false,
  };
}

/**
 * source PROPIO, kcal = atwaterKcal (nunca del input), sourceKey null, nutrients null,
 * groupAutoAssigned false. Valida validateOwnFoodMacros y el nombre contra otros propios.
 */
export async function createOwnFood(input: OwnFoodInput): Promise<Food> {
  assertValidOwnFood(input);
  const { own } = await findFoodNameConflicts(input.name);
  if (own) throw new DuplicateOwnFoodNameError(own.id);
  return prisma.food.create({
    data: { ...ownFoodData(input), source: "PROPIO", sourceKey: null },
  });
}

/** Solo PROPIO (si no, FoodNotEditableError). Recalcula kcal por Atwater (D1) y apaga groupAutoAssigned. */
export async function updateOwnFood(id: string, input: OwnFoodInput): Promise<Food> {
  const current = await prisma.food.findUniqueOrThrow({ where: { id }, select: { source: true } });
  if (current.source !== "PROPIO") throw new FoodNotEditableError();
  assertValidOwnFood(input);
  const { own } = await findFoodNameConflicts(input.name, id);
  if (own) throw new DuplicateOwnFoodNameError(own.id);
  return prisma.food.update({ where: { id }, data: ownFoodData(input) });
}

export async function setFoodActive(id: string, active: boolean): Promise<void> {
  await prisma.food.update({ where: { id }, data: { active } });
}

/** Solo PROPIO: kcalPer100 = atwaterKcal de sus macros guardados ("Usar X kcal", D1). */
export async function applyAtwaterKcal(id: string): Promise<Food> {
  const food = await prisma.food.findUniqueOrThrow({ where: { id } });
  if (food.source !== "PROPIO") throw new FoodNotEditableError();
  const kcal = atwaterKcal({
    protein: Number(food.proteinPer100),
    carbs: Number(food.carbsPer100),
    fat: Number(food.fatPer100),
    alcohol: food.alcoholPer100 === null ? null : Number(food.alcoholPer100),
  });
  return prisma.food.update({ where: { id }, data: { kcalPer100: kcal } });
}

// El enum de Prisma y las claves de packages/core tienen que ser iguales.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _groupsInSync: Same<FoodGroup, FoodGroupKey> = true;
const _sourcesInSync: Same<FoodSource, FoodSourceKey> = true;
void _groupsInSync;
void _sourcesInSync;
