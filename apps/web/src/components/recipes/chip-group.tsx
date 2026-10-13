"use client";

import { useId } from "react";
import { Lock } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/primitives/toggle-group";
import { cn } from "@/lib/utils";

// HU-018a: fila "Etiqueta: chips" (filtros y editor). Chips de 44 px que se envuelven (nunca un
// carrusel). Encendido = primary-soft + tint (estado on de HU-017a), con borde para que el chip
// apagado también se lea como botón.

export type ChipOption = {
  value: string;
  label: string;
  /** HU-018c: nombre accesible si la etiqueta visible es una abreviatura ("Mar" → "Martes"). */
  ariaLabel?: string;
};

const chipClass =
  "h-11 min-w-0 rounded-full border border-border bg-background px-4 text-callout data-[state=on]:border-transparent";

type CommonProps = {
  label: string;
  options: readonly ChipOption[];
  /** Muestra la etiqueta arriba (formulario) en vez de a la izquierda (filtros). */
  labelPosition?: "inline" | "top";
  invalid?: boolean;
  id?: string;
  describedBy?: string;
};

type SingleProps = CommonProps & {
  type: "single";
  value: string | null;
  onChange: (value: string | null) => void;
  /** Primera opción que representa "sin filtro" (value null). Sin esto, no se puede deseleccionar. */
  allLabel?: string;
};

type MultipleProps = CommonProps & {
  type: "multiple";
  value: readonly string[];
  onChange: (value: string[]) => void;
  /**
   * HU-018c: chips que quedan encendidos y no se apagan (aria-disabled, con un candado). El texto de
   * ayuda lo pone quien lo usa.
   */
  lockedValues?: readonly string[];
};

const ALL = "__all";

export function ChipGroup(props: SingleProps | MultipleProps) {
  const labelId = useId();
  const { label, options, labelPosition = "inline", invalid, id, describedBy } = props;
  const locked = props.type === "multiple" ? (props.lockedValues ?? []) : [];
  const group =
    props.type === "single" ? (
      <ToggleGroup
        id={id}
        type="single"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        value={props.value ?? (props.allLabel ? ALL : "")}
        onValueChange={(v) => {
          if (v === "") return; // no se apaga tocando el mismo chip: se elige otro (o "Todas")
          props.onChange(v === ALL ? null : v);
        }}
        className="flex flex-wrap justify-start gap-2"
      >
        {props.allLabel ? (
          <ToggleGroupItem value={ALL} className={chipClass}>
            {props.allLabel}
          </ToggleGroupItem>
        ) : null}
        {options.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value} aria-label={o.ariaLabel} className={chipClass}>
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    ) : (
      <ToggleGroup
        id={id}
        type="multiple"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        value={[...new Set([...props.value, ...locked])]}
        onValueChange={(v) => props.onChange([...new Set([...locked, ...v])])}
        className="flex flex-wrap justify-start gap-2"
      >
        {options.map((o) => {
          const isLocked = locked.includes(o.value);
          return (
            <ToggleGroupItem
              key={o.value}
              value={o.value}
              aria-label={o.ariaLabel}
              aria-disabled={isLocked || undefined}
              className={cn(chipClass, isLocked && "cursor-default gap-1.5 [&_svg]:size-3")}
            >
              {isLocked ? <Lock aria-hidden /> : null}
              {o.label}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    );

  return (
    <div
      className={cn(
        labelPosition === "inline" ? "flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3" : "flex flex-col gap-2",
      )}
    >
      <span
        id={labelId}
        className={cn(
          "text-subheadline font-medium text-foreground",
          labelPosition === "inline" && "sm:w-24 sm:shrink-0 sm:pt-3",
        )}
      >
        {label}
      </span>
      {group}
    </div>
  );
}
