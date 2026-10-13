"use client";

import { Minus, Plus } from "lucide-react";
import { PORTION_MAX, PORTION_MIN, formatPortions, stepPortions, stepperAriaLabel } from "@nutri-bot/core";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * HU-018c (D9): "− 1 porción +", de ½ en ½ entre ½ y 4. Botones de 44 px separados por el texto; el
 * valor se anuncia (aria-live) al cambiar. Lo usan la tarjeta del buscador y el ítem del editor.
 */
export function PortionStepper({
  value,
  onChange,
  recipeName,
  disabled = false,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  recipeName: string;
  disabled?: boolean;
  className?: string;
}) {
  const atMin = value <= PORTION_MIN;
  const atMax = value >= PORTION_MAX;
  return (
    <div role="group" aria-label={`Porciones de ${recipeName}`} className={cn("inline-flex items-center gap-2", className)}>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="size-11 rounded-full [&_svg]:size-5"
        aria-label={stepperAriaLabel(-1, recipeName)}
        disabled={disabled || atMin}
        onClick={() => onChange(stepPortions(value, -1))}
      >
        <Minus aria-hidden />
      </Button>
      <span aria-live="polite" className="min-w-[6.5rem] text-center text-callout font-semibold tabular-nums">
        {formatPortions(value)}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="size-11 rounded-full [&_svg]:size-5"
        aria-label={stepperAriaLabel(1, recipeName)}
        disabled={disabled || atMax}
        onClick={() => onChange(stepPortions(value, 1))}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  );
}
