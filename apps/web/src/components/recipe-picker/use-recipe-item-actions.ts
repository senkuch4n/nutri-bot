"use client";

import { useOptimistic, useTransition } from "react";
import { RECIPE_PICKER_TEXT, type Weekday } from "@nutri-bot/core";
import type { MealOwnerKind } from "@nutri-bot/db/domain";
import {
  addRecipeToMealAction,
  removeRecipeItemsAction,
  setRecipeItemPortionsAction,
} from "@/app/(panel)/recipe-picker-actions";
import { notify } from "@/lib/notify";

/**
 * HU-018c (SDD 7.3.5): agregar una receta (con el toast "Deshacer", que quita exactamente los ítems
 * que se agregaron) y quitar ítems. La revalidación la hace cada action, así que al volver la
 * página ya trae los ítems nuevos.
 */
export function useRecipeItemActions(kind: MealOwnerKind, ownerId: string) {
  async function add(params: {
    mealId: string;
    recipeId: string;
    weekdays: Weekday[] | null;
    /** Texto del toast si sale bien. */
    message: string;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    const result = await addRecipeToMealAction({
      kind,
      ownerId,
      mealId: params.mealId,
      recipeId: params.recipeId,
      weekdays: params.weekdays,
    });
    if (!result.ok) return result;
    const itemIds = result.itemIds;
    notify.undo(params.message, async () => {
      const undone = await removeRecipeItemsAction({ kind, ownerId, itemIds });
      if (undone.ok) notify.saved(RECIPE_PICKER_TEXT.undone);
      else notify.error(undone.error);
    });
    return { ok: true };
  }

  async function remove(itemIds: string[]): Promise<boolean> {
    const result = await removeRecipeItemsAction({ kind, ownerId, itemIds });
    if (!result.ok) notify.error(result.error);
    return result.ok;
  }

  return { add, remove };
}

/**
 * Porciones de UN ítem de receta con respuesta inmediata (useOptimistic). Si la action falla, el valor
 * vuelve solo al anterior al terminar la transición y aparece el toast de error.
 */
export function useRecipePortions(kind: MealOwnerKind, ownerId: string, itemId: string, portions: number) {
  const [optimistic, setOptimistic] = useOptimistic(portions);
  const [pending, startTransition] = useTransition();

  function change(next: number) {
    startTransition(async () => {
      setOptimistic(next);
      const result = await setRecipeItemPortionsAction({ kind, ownerId, itemId, portions: next });
      if (!result.ok) notify.error(result.error);
    });
  }

  return { portions: optimistic, change, pending };
}
