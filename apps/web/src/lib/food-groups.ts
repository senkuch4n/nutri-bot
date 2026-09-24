import type { FoodGroup, FoodSource } from "@nutri-bot/db";
import {
  FOOD_GROUP_LABELS as CORE_LABELS,
  FOOD_GROUP_SHORT_LABELS as CORE_SHORT_LABELS,
  FOOD_GROUP_VALUES,
  FOOD_SOURCE_LABELS as CORE_SOURCE_LABELS,
} from "@nutri-bot/core";

// Re-exporta las etiquetas de packages/core con los tipos de Prisma (HU-005).
export const FOOD_GROUP_LABELS: Record<FoodGroup, string> = CORE_LABELS;
export const FOOD_GROUP_SHORT_LABELS: Record<FoodGroup, string> = CORE_SHORT_LABELS;
export const FOOD_GROUPS: FoodGroup[] = [...FOOD_GROUP_VALUES];
export const FOOD_SOURCE_LABELS: Record<FoodSource, string> = CORE_SOURCE_LABELS;

export function foodGroupLabel(group: string): string {
  return FOOD_GROUP_LABELS[group as FoodGroup] ?? group;
}

export function foodGroupShortLabel(group: string): string {
  return FOOD_GROUP_SHORT_LABELS[group as FoodGroup] ?? group;
}
