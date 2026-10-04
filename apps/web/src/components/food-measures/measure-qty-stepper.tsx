"use client";

import { Minus, Plus } from "lucide-react";
import {
  MEASURE_QTY_MAX,
  MEASURE_QTY_MIN,
  MEASURE_TEXT,
  formatMeasureQty,
  measureStepperAriaLabel,
  stepMeasureQty,
} from "@nutri-bot/core";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * HU-018d (D5): "− 1½ +", de ¼ en ¼ entre ¼ y 20. Mismo look que el control de porciones de las
 * recetas (botones de 44 px, el valor se anuncia al cambiar). En 018d-1b se unifica con
 * PortionStepper en un StepperControl (SDD 7.5).
 */
export function MeasureQtyStepper({
  value,
  onChange,
  foodName,
  disabled = false,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  foodName: string;
  disabled?: boolean;
  className?: string;
}) {
  const atMin = value <= MEASURE_QTY_MIN;
  const atMax = value >= MEASURE_QTY_MAX;
  return (
    <div
      role="group"
      aria-label={MEASURE_TEXT.qtyGroupAria.replace("{food}", foodName)}
      className={cn("inline-flex items-center gap-2", className)}
    >
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="size-11 rounded-full [&_svg]:size-5"
        aria-label={measureStepperAriaLabel(-1, foodName)}
        disabled={disabled || atMin}
        onClick={() => onChange(stepMeasureQty(value, -1))}
      >
        <Minus aria-hidden />
      </Button>
      <span aria-live="polite" className="min-w-[2.75rem] text-center text-callout font-semibold tabular-nums">
        {formatMeasureQty(value)}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="size-11 rounded-full [&_svg]:size-5"
        aria-label={measureStepperAriaLabel(1, foodName)}
        disabled={disabled || atMax}
        onClick={() => onChange(stepMeasureQty(value, 1))}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  );
}
