"use client";

import { PORTION_MAX, PORTION_MIN, formatPortions, stepPortions, stepperAriaLabel } from "@nutri-bot/core";
import { StepperControl } from "@/components/stepper-control";

/**
 * HU-018c (D9): "− 1 porción +", de ½ en ½ entre ½ y 4. Lo usan la tarjeta del buscador y el ítem
 * del editor. HU-018d: es un envoltorio de StepperControl (mismo DOM que antes).
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
  return (
    <StepperControl
      value={value}
      onChange={onChange}
      canDecrement={value > PORTION_MIN}
      canIncrement={value < PORTION_MAX}
      step={(direction) => stepPortions(value, direction)}
      format={formatPortions}
      groupLabel={`Porciones de ${recipeName}`}
      minusLabel={stepperAriaLabel(-1, recipeName)}
      plusLabel={stepperAriaLabel(1, recipeName)}
      disabled={disabled}
      className={className}
      valueClassName="min-w-[6.5rem]"
    />
  );
}
