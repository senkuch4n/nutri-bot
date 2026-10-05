"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import {
  MEASURE_NAME_MAX,
  MEASURE_SUGGESTIONS,
  MEASURE_TEXT,
  measurePreview,
  parseEsArNumber,
  validateMeasure,
  type MeasureInput,
} from "@nutri-bot/core";
import { createFoodMeasureAction, updateFoodMeasureAction } from "@/app/(panel)/food-measure-actions";
import { Modal } from "@/components/modal";
import { NumberInput } from "@/components/number-input";
import { Alert, Button, Field, Input } from "@/components/ui";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import type { FoodMeasureView, MeasureFieldErrors, MeasurePrefill } from "./types";

export interface MeasureDialogFood {
  id: string;
  name: string;
  kcalPer100: number;
}

/** Lee los gramos del campo: acepta "180", "12,5" y "12.5" (el input numérico manda punto). */
function readGrams(text: string): number | null {
  const parsed = parseEsArNumber(text.trim().replace(".", ","));
  return parsed.ok ? parsed.value : Number.NaN;
}

/**
 * HU-018d (SDD 7.3): cuadro "Agregar medida" / "Editar medida". Lo usan la ficha del alimento y el
 * editor del plan. Chips de sugerencias, gramos de una medida, vista previa en vivo con el plural
 * automático y un campo de plural opcional. Valida en el cliente con las mismas reglas que el
 * server (validateMeasure de core).
 */
export function MeasureFormDialog({
  open,
  onClose,
  food,
  initial,
  onSaved,
  savedMessage = MEASURE_TEXT.saved,
}: {
  open: boolean;
  onClose: () => void;
  food: MeasureDialogFood;
  /** Una medida existente (editar) o solo un nombre para prellenar (nueva). */
  initial?: FoodMeasureView | MeasurePrefill;
  onSaved: (measure: FoodMeasureView) => void;
  /** Toast al guardar: "Medida guardada" (ficha) o "Medida guardada en …" (editor). */
  savedMessage?: string;
}) {
  const editing = initial && "id" in initial ? initial : null;
  return (
    <Modal open={open} onClose={onClose} title={editing ? MEASURE_TEXT.dialogEdit : MEASURE_TEXT.dialogNew}>
      {/* El contenido se monta al abrir (Radix): cada apertura arranca con los datos de `initial`. */}
      <MeasureFormBody food={food} initial={initial} onClose={onClose} onSaved={onSaved} savedMessage={savedMessage} />
    </Modal>
  );
}

export function MeasureFormBody({
  food,
  initial,
  onClose,
  onSaved,
  savedMessage,
}: {
  food: MeasureDialogFood;
  initial?: FoodMeasureView | MeasurePrefill;
  onClose: () => void;
  onSaved: (measure: FoodMeasureView) => void;
  savedMessage: string;
}) {
  const editing = initial && "id" in initial ? initial : null;
  const [name, setName] = useState(initial?.name ?? "");
  const initialGrams = editing ? editing.grams : initial && "grams" in initial ? initial.grams : undefined;
  const [gramsText, setGramsText] = useState(initialGrams !== undefined ? String(initialGrams) : "");
  const [plural, setPlural] = useState(editing?.plural ?? "");
  const [pluralOpen, setPluralOpen] = useState(Boolean(editing?.plural));
  const [errors, setErrors] = useState<MeasureFieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const gramsRef = useRef<HTMLInputElement>(null);

  const input: MeasureInput = { name, plural: plural.trim() === "" ? null : plural, grams: readGrams(gramsText) };
  const preview = measurePreview(input, food);

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    const issues = validateMeasure(input);
    if (issues.length > 0) {
      setErrors(Object.fromEntries(issues.map((i) => [i.field, i.message])));
      setServerError(null);
      return;
    }
    setErrors({});
    setServerError(null);
    startTransition(async () => {
      const fields = { name: input.name, plural: input.plural, grams: input.grams };
      const result = editing
        ? await updateFoodMeasureAction({ measureId: editing.id, ...fields })
        : await createFoodMeasureAction({ foodId: food.id, ...fields });
      if (result.ok) {
        notify.saved(savedMessage);
        onSaved(result.measure);
        onClose();
        return;
      }
      setErrors(result.fieldErrors ?? {});
      setServerError(result.error ?? null);
    });
  }

  return (
    <form onSubmit={save} noValidate className="space-y-5">
      <div className="space-y-2">
        <Field label={MEASURE_TEXT.nameLabel} error={errors.name}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={MEASURE_TEXT.namePlaceholder}
            maxLength={MEASURE_NAME_MAX}
            autoComplete="off"
            aria-invalid={errors.name ? true : undefined}
          />
        </Field>
        <div role="group" aria-label={MEASURE_TEXT.suggestionsLabel} className="flex flex-wrap gap-2">
          {MEASURE_SUGGESTIONS.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => {
                setName(s.name);
                gramsRef.current?.focus();
              }}
              aria-pressed={name.trim() === s.name}
              className={cn(
                "inline-flex h-11 items-center rounded-full px-3.5 text-subheadline font-medium transition-colors duration-hover ease-out-soft",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                name.trim() === s.name
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground hover:bg-overlay-hover",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <Field label={MEASURE_TEXT.gramsLabel} hint={MEASURE_TEXT.gramsHint} error={errors.grams}>
        <NumberInput
          ref={gramsRef}
          unit="g"
          step="0.1"
          min="0.1"
          max="2000"
          inputMode="decimal"
          value={gramsText}
          onChange={(e) => setGramsText(e.target.value)}
          aria-invalid={errors.grams ? true : undefined}
        />
      </Field>

      {pluralOpen ? (
        <Field label={MEASURE_TEXT.pluralLabel} hint={MEASURE_TEXT.pluralHint} error={errors.plural}>
          <Input
            value={plural}
            onChange={(e) => setPlural(e.target.value)}
            maxLength={MEASURE_NAME_MAX}
            autoComplete="off"
            aria-invalid={errors.plural ? true : undefined}
          />
        </Field>
      ) : (
        <Button type="button" variant="link" size="sm" className="px-0" onClick={() => setPluralOpen(true)}>
          {MEASURE_TEXT.pluralLink}
        </Button>
      )}

      <div aria-live="polite" className={cn("text-callout tabular-nums", preview && "rounded-lg bg-secondary px-4 py-3")}>
        {preview ? (
          <>
            <p>{preview.one}</p>
            <p className="text-muted-foreground">{preview.two}</p>
          </>
        ) : null}
      </div>

      {serverError ? <Alert tone="danger">{serverError}</Alert> : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" size="lg" onClick={onClose} disabled={pending}>
          {MEASURE_TEXT.cancel}
        </Button>
        <Button type="submit" size="lg" loading={pending}>
          {MEASURE_TEXT.save}
        </Button>
      </div>
    </form>
  );
}
