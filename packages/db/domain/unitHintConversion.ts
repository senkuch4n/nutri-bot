/**
 * HU-018d (D9, SDD 3.6 y 5.4): convierte en medidas caseras los `Food.unitHint` legibles
 * ("1 taza ≈ 180 g" → taza = 180 g). Solo lo usan scripts: NO se exporta desde domain/index.ts.
 *
 * - En seco (`apply: false`) no escribe nada: solo reporta.
 * - Con `apply: true` escribe todo en UNA transacción.
 * - Idempotente: crea la medida solo si el alimento no tiene ya una con el mismo nameKey.
 * - Nunca modifica ni borra `unitHint`, nunca toca otras medidas ni ítems de planes.
 */
import { normalizeMeasureInput, parseUnitHint, validateMeasure } from "@nutri-bot/core";
import { prisma, type Prisma } from "../index";

export interface UnitHintRow {
  foodId: string;
  foodName: string;
  source: "SARA2" | "PROPIO";
  unitHint: string;
  result:
    | { kind: "CREATED" | "WOULD_CREATE"; name: string; grams: number }
    | { kind: "ALREADY_HAD"; name: string }
    | { kind: "UNREADABLE" };
}

type Client = Prisma.TransactionClient | typeof prisma;

async function convert(client: Client, apply: boolean, foodIds?: string[]): Promise<UnitHintRow[]> {
  const foods = await client.food.findMany({
    where: { unitHint: { not: null }, ...(foodIds ? { id: { in: foodIds } } : {}) },
    select: {
      id: true,
      name: true,
      source: true,
      unitHint: true,
      measures: { select: { name: true, nameKey: true, order: true } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  const rows: UnitHintRow[] = [];
  for (const food of foods) {
    const unitHint = food.unitHint?.trim() ?? "";
    if (unitHint === "") continue;
    const base = { foodId: food.id, foodName: food.name, source: food.source, unitHint };
    const parsed = parseUnitHint(unitHint);
    const input = parsed ? { name: parsed.name, plural: null, grams: parsed.grams } : null;
    if (!input || validateMeasure(input).length > 0) {
      rows.push({ ...base, result: { kind: "UNREADABLE" } });
      continue;
    }
    const data = normalizeMeasureInput(input);
    const existing = food.measures.find((m) => m.nameKey === data.nameKey);
    if (existing) {
      rows.push({ ...base, result: { kind: "ALREADY_HAD", name: existing.name } });
      continue;
    }
    if (apply) {
      const order = food.measures.reduce((max, m) => Math.max(max, m.order), -1) + 1;
      await client.foodMeasure.create({
        data: { foodId: food.id, name: data.name, nameKey: data.nameKey, plural: data.plural, grams: data.grams, order },
      });
    }
    rows.push({ ...base, result: { kind: apply ? "CREATED" : "WOULD_CREATE", name: data.name, grams: data.grams } });
  }
  return rows;
}

/**
 * Recorre los alimentos con unitHint no vacío (todos, cualquier fuente y estado; o solo `foodIds` si
 * viene). parseUnitHint; si es legible y el alimento no tiene una medida con ese nameKey, la crea
 * al final (apply) o la reporta (seco). Una transacción con apply. Nunca toca unitHint ni otras medidas.
 */
export async function convertUnitHints(params: { apply: boolean; foodIds?: string[] }): Promise<UnitHintRow[]> {
  if (!params.apply) return convert(prisma, false, params.foodIds);
  return prisma.$transaction((tx) => convert(tx, true, params.foodIds), { timeout: 60_000 });
}
