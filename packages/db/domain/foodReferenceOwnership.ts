import type { Prisma } from "../index";

export const FOOD_REFERENCE_UNAVAILABLE = "El alimento no está disponible para este consultorio.";

/** Exact persisted IDs; visibility and catalog presence do not determine reference ownership. */
export async function unavailableFoodReferences(
  tx: Prisma.TransactionClient,
  tenantId: string,
  foodIds: readonly string[],
): Promise<Set<string>> {
  const unavailable = new Set(foodIds);
  if (unavailable.size === 0) return unavailable;
  const foods = await tx.food.findMany({
    where: { id: { in: [...unavailable] } },
    select: { id: true, source: true, tenantId: true },
  });
  for (const food of foods) {
    if (food.source === "SARA2" || (food.source === "PROPIO" && food.tenantId === tenantId)) {
      unavailable.delete(food.id);
    }
  }
  return unavailable;
}
