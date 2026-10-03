"use client";

import { useId } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/primitives/toggle-group";
import { cn } from "@/lib/utils";

// HU-018a: fila "Etiqueta: chips" (filtros y editor). Chips de 44 px que se envuelven (nunca un
// carrusel). Encendido = primary-soft + tint (estado on de HU-017a), con borde para que el chip
// apagado también se lea como botón.

export type ChipOption = { value: string; label: string };

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
};

const ALL = "__all";

export function ChipGroup(props: SingleProps | MultipleProps) {
  const labelId = useId();
  const { label, options, labelPosition = "inline", invalid, id, describedBy } = props;
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
          <ToggleGroupItem key={o.value} value={o.value} className={chipClass}>
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
        value={[...props.value]}
        onValueChange={(v) => props.onChange(v)}
        className="flex flex-wrap justify-start gap-2"
      >
        {options.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value} className={chipClass}>
            {o.label}
          </ToggleGroupItem>
        ))}
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
