"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { searchFoods } from "@nutri-bot/core";
import { useFoodCatalog, type CatalogFood } from "@/components/food-catalog";
import { FoodSourceBadge } from "@/components/food-source-badge";
import { inputClass } from "@/components/ui";
import { foodGroupShortLabel } from "@/lib/food-groups";
import { cn } from "@/lib/utils";

const MAX_RESULTS = 20;
const FREE_LABEL = "Alimento libre / sin macros";
const countFormat = new Intl.NumberFormat("es-AR");

type Option = { kind: "free" } | { kind: "food"; food: CatalogFood };

/**
 * Combobox con búsqueda para elegir un alimento del catálogo (HU-005, patrón ARIA 1.2
 * "combobox con listbox"). Manda el id elegido en `<input type="hidden" name={name}>`
 * ("" = alimento libre). Filtra en el cliente con `searchFoods` (sin round-trips).
 */
export function FoodPicker({ name = "foodId" }: { name?: string }) {
  const { foods } = useFoodCatalog();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = useMemo(() => (query.trim() ? searchFoods(foods, query, MAX_RESULTS) : []), [foods, query]);
  const options: Option[] = useMemo(
    () => [{ kind: "free" }, ...results.map((food): Option => ({ kind: "food", food }))],
    [results],
  );

  // React 19 resetea el form después de la action: volver a "Alimento libre".
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => {
      setQuery("");
      setSelectedId("");
      setOpen(false);
      setActive(0);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  // Mantener visible la opción activa al moverse con el teclado.
  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open]);

  function choose(option: Option) {
    if (option.kind === "free") {
      setSelectedId("");
      setQuery("");
    } else {
      setSelectedId(option.food.id);
      setQuery(option.food.name);
    }
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        setActive((i) => (i + 1) % options.length);
        return;
      case "ArrowUp":
        e.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        setActive((i) => (i - 1 + options.length) % options.length);
        return;
      case "Enter":
        if (open) {
          // No enviar el form: Enter elige.
          e.preventDefault();
          const option = options[active];
          if (option) choose(option);
        }
        return;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        return;
      case "Tab":
        setOpen(false);
        return;
    }
  }

  const hasQuery = query.trim() !== "";
  const selectedIsCurrent = selectedId !== "" && foods.some((f) => f.id === selectedId && f.name === query);

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selectedId} />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? optionId(active) : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder="Buscar alimento…"
        value={query}
        className={cn(inputClass, selectedIsCurrent && "font-medium")}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedId("");
          setActive(e.target.value.trim() ? 1 : 0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {open ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <ul id={listId} role="listbox" aria-label="Alimentos" className="max-h-80 overflow-auto py-1">
            {options.map((option, i) => {
              const isActive = i === active;
              const selected = option.kind === "free" ? selectedId === "" : option.food.id === selectedId;
              return (
                <li
                  key={option.kind === "free" ? "__free" : option.food.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(option);
                  }}
                  onMouseMove={() => setActive(i)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm",
                    isActive && "bg-accent text-accent-foreground",
                  )}
                >
                  {option.kind === "free" ? (
                    <span className="text-muted-foreground">{FREE_LABEL}</span>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{option.food.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
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
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              Escribí para buscar entre {countFormat.format(foods.length)} alimentos.
            </p>
          ) : results.length === 0 ? (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground" onMouseDown={(e) => e.preventDefault()}>
              No hay alimentos que coincidan. Podés agregarlo como alimento libre o crearlo en{" "}
              <Link
                href="/alimentos/nuevo"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline underline-offset-2"
              >
                Alimentos
              </Link>
              .
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
