"use client";

import { forwardRef, useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { searchFoods } from "@nutri-bot/core";
import { useFoodCatalog, type CatalogFood } from "@/components/food-catalog";
import { FoodSourceBadge } from "@/components/food-source-badge";
import { inputClass } from "@/components/ui";
import { foodGroupShortLabel } from "@/lib/food-groups";
import { cn } from "@/lib/utils";

// HU-018a (12-D6): combobox CONTROLADO para el ingrediente de una receta (patrón ARIA 1.2, mismo
// teclado que FoodPicker). Es nuevo para no tocar FoodPicker (zona de Leo): conviene unificarlos
// en 017e. La opción 0 es "Sin alimento (texto libre)".

const MAX_RESULTS = 20;
const FREE_LABEL = "Sin alimento (texto libre)";
const countFormat = new Intl.NumberFormat("es-AR");

type Option = { kind: "free" } | { kind: "food"; food: CatalogFood };

export const IngredientFoodPicker = forwardRef<
  HTMLInputElement,
  {
    id: string;
    value: string | null;
    onChange: (food: CatalogFood | null) => void;
    placeholder?: string;
    invalid?: boolean;
    describedBy?: string;
    ariaLabel?: string;
  }
>(function IngredientFoodPicker(
  { id, value, onChange, placeholder = "Buscar alimento…", invalid, describedBy, ariaLabel = "Alimento" },
  ref,
) {
  const { foods } = useFoodCatalog();
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const selected = useMemo(() => (value ? (foods.find((f) => f.id === value) ?? null) : null), [foods, value]);

  const [query, setQuery] = useState(selected?.name ?? "");
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // Valor que cambia desde afuera (o al terminar de editar): el texto muestra el alimento elegido.
  useEffect(() => {
    if (!editing) setQuery(selected?.name ?? "");
  }, [selected, editing]);

  const results = useMemo(
    () => (editing && query.trim() ? searchFoods(foods, query, MAX_RESULTS) : []),
    [foods, query, editing],
  );
  const options: Option[] = useMemo(
    () => [{ kind: "free" }, ...results.map((food): Option => ({ kind: "food", food }))],
    [results],
  );

  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open]);

  function close() {
    setOpen(false);
    setEditing(false);
  }

  function choose(option: Option) {
    if (option.kind === "free") onChange(null);
    else onChange(option.food);
    setQuery(option.kind === "free" ? "" : option.food.name);
    close();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) return setOpen(true);
        setActive((i) => (i + 1) % options.length);
        return;
      case "ArrowUp":
        e.preventDefault();
        if (!open) return setOpen(true);
        setActive((i) => (i - 1 + options.length) % options.length);
        return;
      case "Enter":
        if (open) {
          e.preventDefault();
          const option = options[active];
          if (option) choose(option);
        }
        return;
      case "Escape":
        if (open) {
          e.preventDefault();
          close();
        }
        return;
      case "Tab":
        close();
        return;
    }
  }

  const hasQuery = editing && query.trim() !== "";

  return (
    <div className="relative">
      <input
        ref={ref}
        id={id}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={query}
        className={cn(inputClass, "h-11 text-body", selected && !editing && "font-medium")}
        onChange={(e) => {
          setEditing(true);
          setQuery(e.target.value);
          setActive(e.target.value.trim() ? 1 : 0);
          setOpen(true);
        }}
        onFocus={(e) => {
          setOpen(true);
          e.currentTarget.select();
        }}
        onClick={() => setOpen(true)}
        onBlur={close}
        onKeyDown={onKeyDown}
      />
      {open ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <ul id={listId} role="listbox" aria-label="Alimentos" className="max-h-80 overflow-auto py-1">
            {options.map((option, i) => {
              const isActive = i === active;
              const isSelected = option.kind === "free" ? value === null : option.food.id === value;
              return (
                <li
                  key={option.kind === "free" ? "__free" : option.food.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(option);
                  }}
                  onMouseMove={() => setActive(i)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-callout",
                    isActive && "bg-accent text-accent-foreground",
                  )}
                >
                  {option.kind === "free" ? (
                    <span className="text-muted-foreground">{FREE_LABEL}</span>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{option.food.name}</span>
                        <span className="block truncate text-footnote text-muted-foreground">
                          {foodGroupShortLabel(option.food.group)}
                        </span>
                      </span>
                      <FoodSourceBadge source={option.food.source} />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {!hasQuery ? (
            <p className="border-t px-3 py-2 text-footnote text-muted-foreground">
              Escribí para buscar entre {countFormat.format(foods.length)} alimentos.
            </p>
          ) : results.length === 0 ? (
            <p className="border-t px-3 py-2 text-footnote text-muted-foreground">
              No hay alimentos que coincidan. Elegí «{FREE_LABEL}» y escribí el ingrediente.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
