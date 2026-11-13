"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import {
  MEASURE_TEXT,
  formatGrams,
  measureItemGrams,
  measureOptionLabel,
  measureSavedInMessage,
} from "@nutri-bot/core";
import { useFoodCatalog } from "@/components/food-catalog";
import { FoodPicker } from "@/components/food-picker";
import { NumberInput } from "@/components/number-input";
import { SegmentedControl } from "@/components/segmented-control";
import { SubmitButton } from "@/components/submit-button";
import { notify } from "@/lib/notify";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { MeasureFormDialog } from "./measure-form-dialog";
import { MeasureQtyStepper } from "./measure-qty-stepper";
import type { AddMealItemResult, FoodMeasureView } from "./types";

export type QuantityMode = "household" | "grams";

export interface QuantityFood {
  id: string;
  name: string;
}

/** Cantidad con coma (es-AR) para el hidden: "1,5". readMeasureFields acepta coma o punto. */
const qtyValue = (qty: number) => String(qty).replace(".", ",");

/**
 * HU-018d (SDD 7.4): la parte de "Cantidad" del bloque "Agregar alimento". Sin alimento o con un
 * alimento sin medidas: el campo de gramos de siempre (y, si hay alimento, el botón para crear una
 * medida). Con medidas: "Medida casera | Gramos"; en medida casera, stepper + medida + "= 270 g", y
 * viajan `measureId` y `measureQty` (el campo de gramos no se renderiza, así no viaja).
 */
export function QuantityFields({
  food,
  measures,
  mode,
  measureId,
  qty,
  onModeChange,
  onMeasureChange,
  onQtyChange,
  onAddMeasure,
}: {
  food: QuantityFood | null;
  measures: FoodMeasureView[];
  mode: QuantityMode;
  measureId: string;
  qty: number;
  onModeChange: (mode: QuantityMode) => void;
  onMeasureChange: (measureId: string) => void;
  onQtyChange: (qty: number) => void;
  onAddMeasure: () => void;
}) {
  const hasMeasures = food !== null && measures.length > 0;
  const household = hasMeasures && mode === "household";
  const measure = household ? (measures.find((m) => m.id === measureId) ?? measures[0]!) : null;

  return (
    <div className="space-y-4">
      {hasMeasures ? (
        <SegmentedControl
          aria-label={MEASURE_TEXT.modeAria}
          size="lg"
          value={household ? "household" : "grams"}
          onValueChange={onModeChange}
          options={[
            { value: "household", label: MEASURE_TEXT.modeHousehold },
            { value: "grams", label: MEASURE_TEXT.modeGrams },
          ]}
        />
      ) : null}

      {household && measure && food ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <input type="hidden" name="measureId" value={measure.id} />
          <input type="hidden" name="measureQty" value={qtyValue(qty)} />
          <div>
            {/* No es un <label>: tocar el rótulo apretaría el "−". */}
            <span className="mb-1.5 block text-subheadline font-medium text-foreground">{MEASURE_TEXT.qtyLabel}</span>
            <MeasureQtyStepper value={qty} onChange={onQtyChange} foodName={food.name} />
          </div>
          <div className="flex items-end gap-4 sm:flex-1">
            <div className="min-w-0 flex-1">
              <Field label={MEASURE_TEXT.measureLabel}>
                <Select className="h-11" value={measure.id} onChange={(e) => onMeasureChange(e.target.value)}>
                  {measures.map((m) => (
                    <option key={m.id} value={m.id}>
                      {measureOptionLabel(m)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <p aria-live="polite" className="shrink-0 pb-2 text-title3 font-semibold tabular-nums">
              = {formatGrams(measureItemGrams(qty, measure.grams))}
            </p>
          </div>
        </div>
      ) : (
        <div className="sm:w-36">
          <Field label="Cantidad">
            <NumberInput unit="g" name="quantityGrams" min="0" step="1" />
          </Field>
        </div>
      )}

      {food !== null && measures.length === 0 ? (
        <Button type="button" variant="secondary" onClick={onAddMeasure}>
          <Plus aria-hidden />
          {MEASURE_TEXT.addFromEditor}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * HU-018d (SDD 7.4): el bloque "Agregar alimento" de cada comida (planes y plantillas), movido tal
 * cual desde meals-editor.tsx, más el modo medida casera y crear una medida sin salir del plan.
 */
export function AddFoodForm({
  mealId,
  ownerField,
  ownerId,
  weekday,
  submitLabel,
  addItemAction,
}: {
  mealId: string;
  ownerField: "planId" | "templateId";
  ownerId: string;
  /** "" = todos los días. */
  weekday: string;
  submitLabel: string;
  addItemAction: (formData: FormData) => Promise<AddMealItemResult | void>;
}) {
  const { foods, measuresFor, addMeasure } = useFoodCatalog();
  const formRef = useRef<HTMLFormElement>(null);
  const [foodId, setFoodId] = useState("");
  const [mode, setMode] = useState<QuantityMode>("grams");
  const [measureId, setMeasureId] = useState("");
  const [qty, setQty] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  const catalogFood = foodId ? foods.find((f) => f.id === foodId) ?? null : null;
  const food = catalogFood ? { id: catalogFood.id, name: catalogFood.name } : null;
  const measures = foodId ? measuresFor(foodId) : [];

  // Al elegir un alimento: con medidas, "Medida casera" con la primera (D13) y 1; si no, gramos.
  function onFoodChange(next: string) {
    setFoodId(next);
    const list = next ? measuresFor(next) : [];
    setMode(list.length > 0 ? "household" : "grams");
    setMeasureId(list[0]?.id ?? "");
    setQty(1);
  }

  // React 19 resetea el form después de la action (como FoodPicker): vuelve a gramos y a 1.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const onReset = () => {
      setFoodId("");
      setMode("grams");
      setMeasureId("");
      setQty(1);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  // 018d-1b (R4): si la action contesta un error (p. ej. la medida se borró con el editor abierto),
  // se avisa con un toast; la página se revalida y trae las medidas actuales.
  async function submit(formData: FormData) {
    const result = await addItemAction(formData);
    if (result && !result.ok) notify.error(result.error);
  }

  function onMeasureSaved(measure: FoodMeasureView) {
    addMeasure(measure.foodId, measure);
    setMode("household");
    setMeasureId(measure.id);
    setQty(1);
  }

  return (
    <>
      <form ref={formRef} action={submit} className="mt-4 space-y-4">
        <h3 className="text-sm font-semibold">Agregar alimento</h3>
        <input type="hidden" name="mealId" value={mealId} />
        <input type="hidden" name={ownerField} value={ownerId} />
        <input type="hidden" name="weekday" value={weekday} />
        <Field label="Alimento">
          <FoodPicker name="foodId" onValueChange={onFoodChange} />
        </Field>
        <QuantityFields
          food={food}
          measures={measures}
          mode={mode}
          measureId={measureId}
          qty={qty}
          onModeChange={setMode}
          onMeasureChange={setMeasureId}
          onQtyChange={setQty}
          onAddMeasure={() => setDialogOpen(true)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Descripción libre" hint="Solo si no elegiste un alimento.">
            <Input name="customLabel" />
          </Field>
          <Field label="Nota" hint="Opcional">
            <Textarea name="notes" rows={1} className="min-h-9" />
          </Field>
        </div>
        <SubmitButton variant="secondary" size="lg" pendingLabel="Agregando…">
          <Plus aria-hidden />
          {submitLabel}
        </SubmitButton>
      </form>
      {/* Fuera del <form>: el cuadro tiene su propio formulario. */}
      {catalogFood ? (
        <MeasureFormDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          food={{ id: catalogFood.id, name: catalogFood.name, kcalPer100: catalogFood.kcalPer100 ?? 0 }}
          onSaved={onMeasureSaved}
          savedMessage={measureSavedInMessage(catalogFood.name)}
        />
      ) : null}
    </>
  );
}
