"use client";

import { useId, type ReactNode } from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { LayoutGroup, m } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { springs } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
  "aria-label"?: string;
};

const sizes = { sm: "h-7", md: "h-8", lg: "h-10" } as const;

/**
 * Control segmentado (HU-017a §9.4): elegir una de 2–5 opciones excluyentes. Sobre ToggleGroup de
 * Radix (flechas para moverse, Espacio/Enter para elegir); no se puede deseleccionar. El thumb se
 * desliza con `layoutId` (§7, §8); con movimiento reducido aparece en su lugar.
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  "aria-label": ariaLabel,
  size = "md",
  fullWidth = false,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  "aria-label": string;
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <LayoutGroup id={id}>
      <ToggleGroupPrimitive.Root
        type="single"
        value={value}
        onValueChange={(next) => {
          if (next) onValueChange(next as T); // "" = intento de deseleccionar: se ignora
        }}
        role="radiogroup"
        aria-label={ariaLabel}
        className={cn(
          "relative isolate inline-grid auto-cols-fr grid-flow-col items-stretch rounded-full bg-secondary p-0.5",
          sizes[size],
          fullWidth && "grid w-full",
          className,
        )}
      >
        {options.map((option) => {
          const selected = option.value === value;
          const Icon = option.icon;
          return (
            <ToggleGroupPrimitive.Item
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              aria-label={option["aria-label"]}
              className={cn(
                "relative z-0 inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-subheadline font-medium text-foreground press-none touch-target transition-[background-color,opacity] duration-hover ease-out-soft",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40",
                !selected && "hover:bg-overlay-hover pressed:opacity-60",
                selected && "font-semibold",
              )}
            >
              {selected ? (
                <m.span
                  layoutId="segmented-thumb"
                  aria-hidden
                  transition={springs.indicator}
                  className="absolute inset-0 -z-10 rounded-full bg-background shadow-thumb"
                />
              ) : null}
              {Icon ? <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden /> : null}
              <span className="truncate">{option.label}</span>
            </ToggleGroupPrimitive.Item>
          );
        })}
      </ToggleGroupPrimitive.Root>
    </LayoutGroup>
  );
}
