import { prisma, type FoodGroup } from "../index";

export function listFoods(params: { group?: FoodGroup; q?: string; activeOnly?: boolean } = {}) {
  return prisma.food.findMany({
    where: {
      ...(params.group ? { group: params.group } : {}),
      ...(params.q ? { name: { contains: params.q, mode: "insensitive" } } : {}),
      ...(params.activeOnly !== false ? { active: true } : {}),
    },
    orderBy: { name: "asc" },
  });
}

export function createFood(data: {
  name: string;
  group: FoodGroup;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  fiberPer100?: number | null;
  unitHint?: string | null;
}) {
  return prisma.food.create({ data });
}

export function updateFood(
  id: string,
  data: Partial<{
    name: string;
    group: FoodGroup;
    kcalPer100: number;
    proteinPer100: number;
    carbsPer100: number;
    fatPer100: number;
    fiberPer100?: number | null;
    unitHint: string | null;
    active: boolean;
  }>,
) {
  return prisma.food.update({ where: { id }, data });
}
