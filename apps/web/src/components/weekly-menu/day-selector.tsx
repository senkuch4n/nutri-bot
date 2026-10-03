"use client";

import { WEEKDAYS, WEEKDAY_LABELS, type Weekday } from "@nutri-bot/core";
import { ToggleGroup, ToggleGroupItem } from "@/components/primitives/toggle-group";
import { cn } from "@/lib/utils";

export type DaySelection = Weekday | "WEEK";

/**
 * HU-018b: selector "Semana" + Lun…Dom. Selección única que no se puede deseleccionar (radiogroup
 * sobre ToggleGroup de Radix: flechas para moverse, Espacio/Enter para elegir). No usa
 * SegmentedControl porque ese es para 2–5 opciones y llega a h-10; acá son 8 de 44 px.
 * Celular: 8 (o 7) columnas a todo el ancho; escritorio: una fila.
 */
export function DaySelector({
  value,
  onValueChange,
  includeWeek = true,
  loadedDays,
  "aria-label": ariaLabel = "Día de la semana",
  className,
}: {
  value: DaySelection;
  onValueChange: (value: DaySelection) => void;
  /** Muestra la opción "Semana" (editor). El portal la oculta. */
  includeWeek?: boolean;
  /** Si viene, los días que no están acá llevan el punto de "sin cargar". */
  loadedDays?: readonly Weekday[];
  "aria-label"?: string;
  className?: string;
}) {
  const options: { value: DaySelection; short: string; long: string; unloaded: boolean }[] = [
    ...(includeWeek ? [{ value: "WEEK" as const, short: "Semana", long: "Semana", unloaded: false }] : []),
    ...WEEKDAYS.map((day) => ({
      value: day,
      short: WEEKDAY_LABELS[day].short,
      long: WEEKDAY_LABELS[day].long,
      unloaded: loadedDays ? !loadedDays.includes(day) : false,
    })),
  ];

  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as DaySelection); // "" = intento de deseleccionar: se ignora
      }}
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "grid w-full gap-1 sm:flex sm:w-auto sm:flex-wrap sm:justify-start sm:gap-2",
        includeWeek ? "grid-cols-8" : "grid-cols-7",
        className,
      )}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          aria-label={option.unloaded ? `${option.long}, sin cargar` : option.long}
          className={cn(
            "relative h-11 min-w-0 flex-col gap-0.5 rounded-lg px-1 text-footnote font-medium tabular-nums sm:min-w-11 sm:px-3 sm:text-subheadline",
            "data-[state=on]:bg-primary-soft data-[state=on]:font-semibold data-[state=on]:text-primary",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <span className="truncate">{option.short}</span>
          {option.unloaded ? <span aria-hidden className="size-1.5 rounded-full bg-tertiary" /> : null}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
