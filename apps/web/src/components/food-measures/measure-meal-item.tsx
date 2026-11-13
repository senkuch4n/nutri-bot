"use client";

import {
  formatGrams,
  formatMacroAmount,
  formatMacrosLine,
  measureAmountText,
  measureItemGrams,
  scaleMacros,
} from "@nutri-bot/core";
import type { MealOwnerKind } from "@nutri-bot/db/domain";
import type { MealItemView } from "@/components/meals-editor";
import { KcalBreakdownPopover } from "@/components/kcal-breakdown-popover";
import { SubmitButton } from "@/components/submit-button";
import { itemLabel } from "@/components/weekly-menu/labels";
import { MeasureQtyStepper } from "./measure-qty-stepper";
import type { MeasureItemView } from "./types";
import { useMeasureItemQty } from "./use-measure-item-qty";

/**
 * HU-018d (SDD 7.6): un ítem de alimento en medida casera dentro de una comida del editor. Igual que
 * el ítem en gramos (nombre, nota, macros con el desglose de Atwater y "Quitar"), pero a la derecha
 * "1½ tazas" con "270 g" en gris debajo, y el stepper de cantidad (018d-1b, D10). La cantidad, los
 * gramos y los macros siguen al valor optimista; la franja del día llega con la revalidación.
 */
export function MeasureMealItem({
  item,
  measure,
  kind,
  ownerId,
  ownerField,
  deleteItemAction,
  showMacros,
  where,
}: {
  item: MealItemView;
  measure: MeasureItemView;
  kind: MealOwnerKind;
  ownerId: string;
  ownerField: "planId" | "templateId";
  deleteItemAction: (formData: FormData) => Promise<void>;
  showMacros: boolean;
  /** "Almuerzo del martes" (para el aria-label de "Quitar"). */
  where: string;
}) {
  const itemName = itemLabel(item);
  const { qty, change, pending } = useMeasureItemQty(kind, ownerId, item.id, measure.qty);
  // Mientras la cantidad optimista no es la guardada, el desglose de Atwater del server es viejo:
  // se oculta el popover y se muestran los macros escalados en texto.
  const stale = pending || qty !== measure.qty;
  const grams = stale
    ? measureItemGrams(qty, measure.gramsPerUnit)
    : item.quantityGrams !== null
      ? Number(item.quantityGrams)
      : measureItemGrams(qty, measure.gramsPerUnit);
  const macros = item.macros && measure.qty > 0 ? (stale ? scaleMacros(item.macros, qty / measure.qty) : item.macros) : null;

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium">{itemName}</p>
        {item.notes ? <p className="mt-0.5 text-xs text-muted-foreground">{item.notes}</p> : null}
        {showMacros && macros ? (
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            {item.kcalBreakdown && !stale ? (
              <>
                <KcalBreakdownPopover kcal={macros.kcal} breakdown={item.kcalBreakdown} itemName={itemName} />
                {` · P ${formatMacroAmount(macros.protein, "g")} · C ${formatMacroAmount(
                  macros.carbs,
                  "g",
                )} · G ${formatMacroAmount(macros.fat, "g")} · Fibra ${formatMacroAmount(macros.fiber, "g")}`}
              </>
            ) : (
              formatMacrosLine(macros, { includeFiber: true })
            )}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
        <div className="min-w-[5.5rem] max-w-[14rem] text-right">
          <p className="break-words text-sm font-medium">{measureAmountText(qty, measure)}</p>
          <p className="text-xs tabular-nums text-muted-foreground">{formatGrams(grams)}</p>
        </div>
        <MeasureQtyStepper value={qty} onChange={change} foodName={itemName} />
        <form action={deleteItemAction}>
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name={ownerField} value={ownerId} />
          <SubmitButton
            variant="ghost"
            size="sm"
            // 44 px, como el stepper de al lado (mismo criterio que el ítem de receta).
            className="h-11 px-4"
            pendingLabel="Quitando…"
            aria-label={`Quitar ${itemName} de ${where}`}
          >
            Quitar
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}
