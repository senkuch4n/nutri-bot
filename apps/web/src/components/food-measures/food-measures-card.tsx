"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import {
  MEASURE_TEXT,
  legacyUnitHintText,
  measureListLine,
  parseUnitHint,
  removeMeasureTitle,
  unitHintPrefillName,
} from "@nutri-bot/core";
import { deleteFoodMeasureAction, moveFoodMeasureAction } from "@/app/(panel)/food-measure-actions";
import { useConfirm } from "@/components/confirm";
import { Alert, Button, Card } from "@/components/ui";
import { notify } from "@/lib/notify";
import { MeasureFormDialog, type MeasureDialogFood } from "./measure-form-dialog";
import type { FoodMeasureView, MeasurePrefill } from "./types";

// `initial` se conserva al cerrar: el título no cambia durante la animación de salida.
type DialogState = { open: boolean; initial?: FoodMeasureView | MeasurePrefill };

/**
 * "Pasar a medida": si parseUnitHint lee el texto ("1 taza ≈ 180 g", también N ≠ 1 con la división de
 * T3), prellena nombre y gramos; si no, el texto (limpio y cortado a 40) va en el nombre.
 */
export function legacyMeasurePrefill(unitHint: string): MeasurePrefill {
  const parsed = parseUnitHint(unitHint);
  return parsed ? { name: parsed.name, grams: parsed.grams } : { name: unitHintPrefillName(unitHint) };
}

/**
 * HU-018d (SDD 7.2): tarjeta "Medidas caseras" de la ficha del alimento, arriba de Energía. Lista
 * con flechas, Editar y Quitar; vacía, un botón grande. En los SARA 2 es editable igual: las medidas
 * son de ella, la composición no cambia. Se refresca con la revalidación de las actions.
 * 018d-1b (D9, T5): si el alimento no tiene ninguna medida y tenía un `unitHint` anotado, se muestra
 * "Tenías anotado: «…»" con "Pasar a medida" (abre el cuadro con el nombre prellenado). Al guardar la
 * primera medida, el aviso desaparece solo.
 */
export function FoodMeasuresCard({
  food,
  measures,
  isSara,
  unitHint = null,
}: {
  food: MeasureDialogFood;
  measures: FoodMeasureView[];
  isSara: boolean;
  /** Referencia de texto libre anterior a la HU (columna `Food.unitHint`, que queda). */
  unitHint?: string | null;
}) {
  const legacyHint = measures.length === 0 && unitHint?.trim() ? unitHint.trim() : null;
  const [dialog, setDialog] = useState<DialogState>({ open: false });
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  function move(measure: FoodMeasureView, direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveFoodMeasureAction({ measureId: measure.id, direction });
      if (!result.ok) notify.error(result.error);
    });
  }

  async function remove(measure: FoodMeasureView) {
    const ok = await confirm({
      title: removeMeasureTitle(measure.name),
      description: MEASURE_TEXT.removeDescription,
      confirmLabel: MEASURE_TEXT.remove,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteFoodMeasureAction({ measureId: measure.id });
      if (result.ok) notify.saved(MEASURE_TEXT.removed);
      else notify.error(result.error);
    });
  }

  return (
    <Card title={MEASURE_TEXT.cardTitle} description={MEASURE_TEXT.cardHelp} className="mb-6 max-w-3xl">
      {isSara ? <p className="-mt-2 mb-4 text-footnote text-muted-foreground">{MEASURE_TEXT.saraNote}</p> : null}

      {measures.length === 0 ? (
        <div className="space-y-4">
          {legacyHint ? (
            <Alert tone="info">
              <p className="text-pretty">{legacyUnitHintText(legacyHint)}</p>
              <Button
                variant="secondary"
                className="mt-3 h-11"
                onClick={() => setDialog({ open: true, initial: legacyMeasurePrefill(legacyHint) })}
              >
                {MEASURE_TEXT.legacyButton}
              </Button>
            </Alert>
          ) : (
            <p className="text-subheadline text-muted-foreground">{MEASURE_TEXT.empty}</p>
          )}
          <Button size="lg" variant={legacyHint ? "secondary" : undefined} onClick={() => setDialog({ open: true })}>
            <Plus aria-hidden />
            {MEASURE_TEXT.addButton}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <ul className="divide-y rounded-md border">
            {measures.map((m, i) => (
              <li key={m.id} className="flex flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-callout font-medium tabular-nums">{measureListLine(m, food.kcalPer100)}</p>
                  {m.plural ? <p className="text-footnote text-muted-foreground">Plural: {m.plural}</p> : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    onClick={() => move(m, "up")}
                    disabled={i === 0 || pending}
                    aria-label={MEASURE_TEXT.moveUp.replace("{name}", m.name)}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    onClick={() => move(m, "down")}
                    disabled={i === measures.length - 1 || pending}
                    aria-label={MEASURE_TEXT.moveDown.replace("{name}", m.name)}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-11"
                    onClick={() => setDialog({ open: true, initial: m })}
                    aria-label={`${MEASURE_TEXT.edit} ${m.name}`}
                  >
                    {MEASURE_TEXT.edit}
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-11"
                    onClick={() => void remove(m)}
                    disabled={pending}
                    aria-label={`${MEASURE_TEXT.remove} ${m.name}`}
                  >
                    {MEASURE_TEXT.remove}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Button variant="secondary" size="lg" onClick={() => setDialog({ open: true })}>
            <Plus aria-hidden />
            {MEASURE_TEXT.addButton}
          </Button>
        </div>
      )}

      <MeasureFormDialog
        open={dialog.open}
        onClose={() => setDialog((d) => ({ ...d, open: false }))}
        food={food}
        initial={dialog.initial}
        onSaved={() => {}}
      />
    </Card>
  );
}
