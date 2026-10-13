"use client";

import {
  MEASURE_QTY_MAX,
  MEASURE_QTY_MIN,
  MEASURE_TEXT,
  formatMeasureQty,
  measureStepperAriaLabel,
  stepMeasureQty,
} from "@nutri-bot/core";
import { StepperControl } from "@/components/stepper-control";

/**
 * HU-018d (D5, SDD 7.5): "− 1½ +", de ¼ en ¼ entre ¼ y 20. Envoltorio de StepperControl, el mismo
 * control que las porciones de receta. Lo usan el alta en medida casera y el ítem del editor.
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
  return (
    <StepperControl
      value={value}
      onChange={onChange}
      canDecrement={value > MEASURE_QTY_MIN}
      canIncrement={value < MEASURE_QTY_MAX}
      step={(direction) => stepMeasureQty(value, direction)}
      format={formatMeasureQty}
      groupLabel={MEASURE_TEXT.qtyGroupAria.replace("{food}", foodName)}
      minusLabel={measureStepperAriaLabel(-1, foodName)}
      plusLabel={measureStepperAriaLabel(1, foodName)}
      disabled={disabled}
      className={className}
      valueClassName="min-w-[2.75rem]"
    />
  );
}
