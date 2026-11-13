"use client";

import { useTransition } from "react";
import type { MealOwnerKind } from "@nutri-bot/db/domain";
import { restoreMealsAction, type MenuActionResult } from "@/app/(panel)/weekly-menu-actions";
import { notify } from "@/lib/notify";

/**
 * HU-018b (SDD 7.9): corre una action del editor semanal en una transición. Si devuelve fotos
 * (`undo`), muestra el toast con "Deshacer", que restaura con `restoreMealsAction`. Si no, un toast
 * de guardado (si hay mensaje). Los errores van al toast de error. La revalidación la hace la action.
 */
export function useMenuUndo(kind: MealOwnerKind, ownerId: string) {
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<MenuActionResult>, message: string | null, onDone?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        notify.error(result.error);
        return;
      }
      onDone?.();
      const snapshots = result.undo;
      if (snapshots && snapshots.length > 0 && message) {
        notify.undo(message, async () => {
          const restored = await restoreMealsAction({ kind, ownerId, snapshots });
          if (restored.ok) notify.saved("Listo, se deshizo el cambio");
          else notify.error();
        });
      } else if (message) {
        notify.saved(message);
      }
    });
  }

  return { pending, run };
}
