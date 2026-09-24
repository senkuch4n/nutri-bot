"use client";

import { useId, type ComponentProps } from "react";
import { inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Campo numérico con la unidad visible a la derecha. El `name` y el valor del form no cambian. */
export function NumberInput({
  unit,
  className,
  step,
  "aria-describedby": describedBy,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { unit: string }) {
  const unitId = useId();
  // Son ids, no clases: se unen a mano (sin `cn`) y el del consumidor (hint, error) se conserva.
  const ariaDescribedBy = [describedBy, unitId].filter(Boolean).join(" ");
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        step={step ?? "any"}
        {...props}
        aria-describedby={ariaDescribedBy}
        className={cn(inputClass, "pr-12 text-right tabular-nums", className)}
      />
      <span
        id={unitId}
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
      >
        {unit}
      </span>
    </div>
  );
}
