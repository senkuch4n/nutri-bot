import type { Sara2Dataset, Sara2Food } from "@nutri-bot/core/sara2";
import type { Prisma } from "../index";

// Cargador de SARA 2 (HU-005, D14): upsert idempotente por sourceKey. Solo toca filas con
// source SARA2: nunca lee ni escribe alimentos propios, y nunca borra (desactiva).

export interface LoadSara2Result {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  deactivated: number;
}

export class Sara2LoadAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Sara2LoadAbortedError";
  }
}

/** Freno: no desactivar más del 10 % de los SARA 2 existentes sin pedirlo explícitamente. */
const MAX_DEACTIVATION_RATIO = 0.1;
const CREATE_BATCH = 200;

// Escala de cada columna numérica (packages/db/prisma/schema.prisma).
const SCALES = {
  kcalPer100: 2,
  proteinPer100: 2,
  carbsPer100: 2,
  fatPer100: 2,
  fiberPer100: 2,
  alcoholPer100: 2,
  sodiumMgPer100: 2,
  addedSugarPer100: 2,
  saturatedFatPer100: 3,
  cholesterolMgPer100: 2,
} as const;
type NumericField = keyof typeof SCALES;
const NUMERIC_FIELDS = Object.keys(SCALES) as NumericField[];

const roundTo = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

function toScaled(field: NumericField, value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? roundTo(n, SCALES[field]) : null;
}

/** JSON con las claves ordenadas, para comparar `nutrients` sin depender del orden. */
function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`)
    .join(",")}}`;
}

function dataFor(food: Sara2Food) {
  const numbers = Object.fromEntries(NUMERIC_FIELDS.map((f) => [f, toScaled(f, food[f])])) as Record<
    NumericField,
    number | null
  >;
  return {
    name: food.name,
    group: food.group,
    kcalPer100: numbers.kcalPer100 ?? 0,
    proteinPer100: numbers.proteinPer100 ?? 0,
    carbsPer100: numbers.carbsPer100 ?? 0,
    fatPer100: numbers.fatPer100 ?? 0,
    fiberPer100: numbers.fiberPer100,
    alcoholPer100: numbers.alcoholPer100,
    sodiumMgPer100: numbers.sodiumMgPer100,
    addedSugarPer100: numbers.addedSugarPer100,
    saturatedFatPer100: numbers.saturatedFatPer100,
    cholesterolMgPer100: numbers.cholesterolMgPer100,
    nutrients: food.nutrients as unknown as Prisma.InputJsonObject,
  };
}

/**
 * Upsert por sourceKey. Recibe el cliente para poder correr dentro de $transaction.
 * - Solo toca filas con source SARA2 (todas las consultas filtran por source: "SARA2").
 * - Crea: source SARA2, active true, unitHint null, reference null, groupAutoAssigned false.
 * - Actualiza SOLO si cambió algo: name, group, kcal y los 9 nutrientes en columnas, nutrients.
 *   Nunca cambia active (respeta lo que ella desactivó), unitHint ni reference.
 * - SARA2 activos cuyo sourceKey no está en el dataset → active false (D14). Nunca borra.
 * - Aborta (Sara2LoadAbortedError) si desactivaría > 10 % de los SARA2 existentes, salvo
 *   options.allowMassDeactivation.
 */
export async function loadSara2Dataset(
  db: Prisma.TransactionClient,
  dataset: Sara2Dataset,
  options?: { allowMassDeactivation?: boolean },
): Promise<LoadSara2Result> {
  const existing = await db.food.findMany({
    where: { source: "SARA2" },
    select: {
      id: true,
      sourceKey: true,
      name: true,
      group: true,
      active: true,
      nutrients: true,
      kcalPer100: true,
      proteinPer100: true,
      carbsPer100: true,
      fatPer100: true,
      fiberPer100: true,
      alcoholPer100: true,
      sodiumMgPer100: true,
      addedSugarPer100: true,
      saturatedFatPer100: true,
      cholesterolMgPer100: true,
    },
  });
  const byKey = new Map(existing.map((f) => [f.sourceKey as string, f]));
  const datasetKeys = new Set(dataset.foods.map((f) => f.sourceKey));

  const toDeactivate = existing.filter((f) => f.active && !datasetKeys.has(f.sourceKey as string));
  if (
    !options?.allowMassDeactivation &&
    existing.length > 0 &&
    toDeactivate.length > existing.length * MAX_DEACTIVATION_RATIO
  ) {
    throw new Sara2LoadAbortedError(
      `La carga desactivaría ${toDeactivate.length} de ${existing.length} alimentos SARA 2 (más del ${
        MAX_DEACTIVATION_RATIO * 100
      } %). Revisá el archivo o usá --allow-mass-deactivation.`,
    );
  }

  const toCreate: Prisma.FoodCreateManyInput[] = [];
  const toUpdate: { id: string; data: ReturnType<typeof dataFor> }[] = [];
  let unchanged = 0;
  for (const food of dataset.foods) {
    const data = dataFor(food);
    const current = byKey.get(food.sourceKey);
    if (!current) {
      toCreate.push({
        ...data,
        source: "SARA2",
        sourceKey: food.sourceKey,
        active: true,
        unitHint: null,
        reference: null,
        groupAutoAssigned: false,
      });
      continue;
    }
    const changed =
      current.name !== data.name ||
      current.group !== data.group ||
      NUMERIC_FIELDS.some((f) => toScaled(f, current[f]) !== data[f]) ||
      stableJson(current.nutrients) !== stableJson(data.nutrients);
    if (changed) toUpdate.push({ id: current.id, data });
    else unchanged++;
  }

  for (let i = 0; i < toCreate.length; i += CREATE_BATCH) {
    await db.food.createMany({ data: toCreate.slice(i, i + CREATE_BATCH) });
  }
  for (const u of toUpdate) {
    await db.food.update({ where: { id: u.id, source: "SARA2" }, data: u.data });
  }
  let deactivated = 0;
  if (toDeactivate.length > 0) {
    const res = await db.food.updateMany({
      where: {
        source: "SARA2",
        sourceKey: { in: toDeactivate.map((f) => f.sourceKey as string) },
        active: true,
      },
      data: { active: false },
    });
    deactivated = res.count;
  }

  return {
    total: dataset.foods.length,
    created: toCreate.length,
    updated: toUpdate.length,
    unchanged,
    deactivated,
  };
}
