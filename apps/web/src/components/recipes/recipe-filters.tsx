"use client";

import type { Ref } from "react";
import { Search } from "lucide-react";
import {
  RECIPE_MOMENTS,
  RECIPE_MOMENT_LABELS,
  RECIPE_TAGS,
  RECIPE_TAG_LABELS,
  RECIPE_TYPES,
  RECIPE_TYPE_LABELS,
  hasActiveRecipeFilters,
  type RecipeFilters as Filters,
  type RecipeMomentKey,
  type RecipeTagKey,
  type RecipeTypeKey,
} from "@nutri-bot/core";
import { Button, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ChipGroup } from "./chip-group";

// HU-018a: buscador + chips (controlado). Lo reusa el buscador de 018c (con `hideMoment` si el
// momento ya viene de la comida). "Etiquetas" se pliega en el celular (progressive disclosure).

const TYPE_OPTIONS = RECIPE_TYPES.map((v) => ({ value: v, label: RECIPE_TYPE_LABELS[v] }));
const MOMENT_OPTIONS = RECIPE_MOMENTS.map((v) => ({ value: v, label: RECIPE_MOMENT_LABELS[v] }));
const TAG_OPTIONS = RECIPE_TAGS.map((v) => ({ value: v, label: RECIPE_TAG_LABELS[v] }));

export function RecipeFilters({
  value,
  onChange,
  countText,
  onClear,
  hideMoment = false,
  placeholder = "Buscar por nombre o ingrediente…",
  searchLabel = "Buscar por nombre o ingrediente",
  inputRef,
}: {
  value: Filters;
  onChange: (next: Filters) => void;
  countText: string;
  onClear: () => void;
  hideMoment?: boolean;
  /** HU-018c: el buscador del plan usa sus propios textos. */
  placeholder?: string;
  searchLabel?: string;
  /** HU-018c: para dar el foco al abrir el buscador. */
  inputRef?: Ref<HTMLInputElement>;
}) {
  const tags = (
    <ChipGroup
      type="multiple"
      label="Etiquetas"
      options={TAG_OPTIONS}
      value={value.tags}
      onChange={(v) => onChange({ ...value, tags: v as RecipeTagKey[] })}
    />
  );
  const tagCount = value.tags.length;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          aria-label={searchLabel}
          placeholder={placeholder}
          value={value.query}
          onChange={(e) => onChange({ ...value, query: e.target.value })}
          autoComplete="off"
          spellCheck={false}
          className={cn(inputClass, "h-12 rounded-lg pl-12 text-body-lg")}
        />
      </div>

      <ChipGroup
        type="single"
        label="Tipo"
        allLabel="Todas"
        options={TYPE_OPTIONS}
        value={value.type}
        onChange={(v) => onChange({ ...value, type: v as RecipeTypeKey | null })}
      />
      {hideMoment ? null : (
        <ChipGroup
          type="single"
          label="Momento"
          allLabel="Todos"
          options={MOMENT_OPTIONS}
          value={value.moment}
          onChange={(v) => onChange({ ...value, moment: v as RecipeMomentKey | null })}
        />
      )}

      <div className="hidden md:block">{tags}</div>
      <details className="group md:hidden" open={tagCount > 0 ? true : undefined}>
        <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-md text-callout font-medium text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="transition-transform duration-hover group-open:rotate-90">
            ›
          </span>
          Más filtros{tagCount > 0 ? ` (${tagCount})` : ""}
        </summary>
        <div className="pt-2">{tags}</div>
      </details>

      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
        <p aria-live="polite" className="text-callout text-muted-foreground tabular-nums">
          {countText}
        </p>
        {hasActiveRecipeFilters(value) ? (
          <Button type="button" variant="plain" size="lg" onClick={onClear} className="px-2">
            Quitar filtros
          </Button>
        ) : null}
      </div>
    </div>
  );
}
