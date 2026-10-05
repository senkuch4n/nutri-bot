"use client";

import { ArrowUp, Check, CheckCircle2 } from "lucide-react";
import { RECIPE_PICKER_TEXT } from "@nutri-bot/core";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { PortionStepper } from "./portion-stepper";

export interface PickerCardImpactView {
  percentText: string;
  fitText: string;
  fits: boolean;
}

/**
 * HU-018c (SDD 7.3.5): pie de cada tarjeta del buscador. Presentacional (el estado vive en el sheet):
 *  - sin `added`: las 2 líneas de impacto (si hay objetivo) y el botón "Agregar" a todo el ancho;
 *  - `pending`: el mismo botón con spinner, deshabilitado y aria-busy;
 *  - `error`: el mensaje junto al botón, con role="alert";
 *  - `added`: "Agregada" con el control de porciones del día que se edita y "Quitar".
 */
export function PickerCardFooter({
  recipeName,
  impact,
  addLabel,
  addAriaLabel,
  pending,
  error,
  added,
  onAdd,
  onPortionsChange,
  onRemove,
  removing = false,
}: {
  recipeName: string;
  impact: PickerCardImpactView | null;
  addLabel: string;
  addAriaLabel: string;
  pending: boolean;
  error: string | null;
  added: { portions: number } | null;
  onAdd: () => void;
  onPortionsChange: (next: number) => void;
  onRemove: () => void;
  removing?: boolean;
}) {
  if (added) {
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-callout font-semibold text-success">
          <Check className="size-4 shrink-0" aria-hidden />
          {RECIPE_PICKER_TEXT.added}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PortionStepper value={added.portions} onChange={onPortionsChange} recipeName={recipeName} />
          <Button
            type="button"
            variant="plain"
            size="lg"
            className="px-3"
            loading={removing}
            aria-label={`${RECIPE_PICKER_TEXT.remove} ${recipeName}`}
            onClick={onRemove}
          >
            {RECIPE_PICKER_TEXT.remove}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {impact ? (
        <div className="space-y-0.5">
          <p className="text-footnote tabular-nums text-muted-foreground">{impact.percentText}</p>
          <p
            className={cn(
              "flex items-start gap-1 text-footnote font-semibold tabular-nums",
              impact.fits ? "text-success" : "text-warning",
            )}
          >
            {impact.fits ? (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            ) : (
              <ArrowUp className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            )}
            {impact.fitText}
          </p>
        </div>
      ) : null}
      <Button
        type="button"
        size="lg"
        className="w-full"
        loading={pending}
        aria-label={addAriaLabel}
        onClick={onAdd}
      >
        {addLabel}
      </Button>
      {error ? (
        <p role="alert" className="text-footnote text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
