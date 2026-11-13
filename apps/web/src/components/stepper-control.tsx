"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * HU-018d (SDD 7.5): el único stepper "− valor +" del panel. Botones de 44 px separados por el
 * valor, que se anuncia (aria-live) al cambiar. Lo envuelven PortionStepper (porciones de receta,
 * HU-018c) y MeasureQtyStepper (cantidad en medida casera, HU-018d).
 */
export function StepperControl({
  value,
  onChange,
  canDecrement,
  canIncrement,
  step,
  format,
  groupLabel,
  minusLabel,
  plusLabel,
  disabled = false,
  className,
  valueClassName,
}: {
  value: number;
  onChange: (next: number) => void;
  canDecrement: boolean;
  canIncrement: boolean;
  /** Próximo valor en esa dirección (con los topes ya aplicados). */
  step: (direction: 1 | -1) => number;
  format: (value: number) => string;
  groupLabel: string;
  minusLabel: string;
  plusLabel: string;
  disabled?: boolean;
  className?: string;
  /** Ancho mínimo del texto (para que los botones no salten al cambiar el valor). */
  valueClassName?: string;
}) {
  return (
    <div role="group" aria-label={groupLabel} className={cn("inline-flex items-center gap-2", className)}>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="size-11 rounded-full [&_svg]:size-5"
        aria-label={minusLabel}
        disabled={disabled || !canDecrement}
        onClick={() => onChange(step(-1))}
      >
        <Minus aria-hidden />
      </Button>
      <span aria-live="polite" className={cn(valueClassName, "text-center text-callout font-semibold tabular-nums")}>
        {format(value)}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="size-11 rounded-full [&_svg]:size-5"
        aria-label={plusLabel}
        disabled={disabled || !canIncrement}
        onClick={() => onChange(step(1))}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  );
}
