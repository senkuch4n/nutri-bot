"use client";

import { useOptimistic, useTransition } from "react";
import type { MealOwnerKind } from "@nutri-bot/db/domain";
import { setMeasureItemQtyAction } from "@/app/(panel)/food-measure-actions";
import { notify } from "@/lib/notify";

/**
 * HU-018d (D10, SDD 7.6): cantidad de UN ítem en medida casera con respuesta inmediata
 * (useOptimistic, patrón de useRecipePortions). Si la action falla, el valor vuelve solo al anterior
 * al terminar la transición y aparece el toast "No se pudo cambiar la cantidad. Probá de nuevo.".
 */
export function useMeasureItemQty(kind: MealOwnerKind, ownerId: string, itemId: string, qty: number) {
  const [optimistic, setOptimistic] = useOptimistic(qty);
  const [pending, startTransition] = useTransition();

  function change(next: number) {
    startTransition(async () => {
      setOptimistic(next);
      const result = await setMeasureItemQtyAction({ kind, ownerId, itemId, qty: next });
      if (!result.ok) notify.error(result.error);
    });
  }

  return { qty: optimistic, change, pending };
}
