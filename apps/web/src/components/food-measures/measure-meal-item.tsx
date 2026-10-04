"use client";

import { formatGrams, formatMacroAmount, formatMacrosLine, measureAmountText } from "@nutri-bot/core";
import type { MealItemView } from "@/components/meals-editor";
import { KcalBreakdownPopover } from "@/components/kcal-breakdown-popover";
import { SubmitButton } from "@/components/submit-button";
import { itemLabel } from "@/components/weekly-menu/labels";
import type { MeasureItemView } from "./types";

/**
 * HU-018d (SDD 7.6): un ítem de alimento en medida casera dentro de una comida del editor. Igual que
 * el ítem en gramos (nombre, nota, macros con el desglose de Atwater y "Quitar"), pero a la derecha
 * "1½ tazas" y debajo "270 g" en gris. En 018d-1a no tiene stepper: para cambiar la cantidad se quita
 * y se vuelve a agregar (el stepper llega en 018d-1b).
 */
export function MeasureMealItem({
  item,
  measure,
  ownerId,
  ownerField,
  deleteItemAction,
  showMacros,
  where,
}: {
  item: MealItemView;
  measure: MeasureItemView;
  ownerId: string;
  ownerField: "planId" | "templateId";
  deleteItemAction: (formData: FormData) => Promise<void>;
  showMacros: boolean;
  /** "Almuerzo del martes" (para el aria-label de "Quitar"). */
  where: string;
}) {
  const itemName = itemLabel(item);
  const grams = item.quantityGrams !== null ? Number(item.quantityGrams) : null;
  return (
    <li className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium">{itemName}</p>
        {item.notes ? <p className="mt-0.5 text-xs text-muted-foreground">{item.notes}</p> : null}
        {showMacros && item.macros ? (
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            {item.kcalBreakdown ? (
              <>
                <KcalBreakdownPopover kcal={item.macros.kcal} breakdown={item.kcalBreakdown} itemName={itemName} />
                {` · P ${formatMacroAmount(item.macros.protein, "g")} · C ${formatMacroAmount(
                  item.macros.carbs,
                  "g",
                )} · G ${formatMacroAmount(item.macros.fat, "g")} · Fibra ${formatMacroAmount(item.macros.fiber, "g")}`}
              </>
            ) : (
              formatMacrosLine(item.macros, { includeFiber: true })
            )}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right">
          <p className="text-sm font-medium">{measureAmountText(measure.qty, measure)}</p>
          {grams !== null ? <p className="text-xs tabular-nums text-muted-foreground">{formatGrams(grams)}</p> : null}
        </div>
        <form action={deleteItemAction}>
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name={ownerField} value={ownerId} />
          <SubmitButton variant="ghost" size="sm" pendingLabel="Quitando…" aria-label={`Quitar ${itemName} de ${where}`}>
            Quitar
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}
