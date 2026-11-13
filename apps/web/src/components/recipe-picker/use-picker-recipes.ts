"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listPickerRecipesAction } from "@/app/(panel)/recipe-picker-actions";
import type { RecipeCardView } from "@/lib/recipe-view";

export type PickerRecipesState =
  | { status: "loading"; cards: RecipeCardView[] | null }
  | { status: "ready"; cards: RecipeCardView[] }
  | { status: "error"; cards: RecipeCardView[] | null; error: string };

/**
 * HU-018c (D10): las recetas se piden con una server action CADA VEZ que se abre el buscador (así
 * aparece una receta recién creada en otra pestaña) y no viajan en la página del plan. Mientras
 * recarga se ven las que ya estaban; el skeleton sale solo la primera vez.
 */
export function usePickerRecipes(open: boolean): PickerRecipesState & { retry: () => void } {
  const [state, setState] = useState<PickerRecipesState>({ status: "loading", cards: null });
  const request = useRef(0);

  const load = useCallback(() => {
    const id = ++request.current;
    setState((prev) => ({ status: "loading", cards: prev.cards }));
    listPickerRecipesAction()
      .then((result) => {
        if (id !== request.current) return;
        setState((prev) =>
          result.ok ? { status: "ready", cards: result.cards } : { status: "error", cards: prev.cards, error: result.error },
        );
      })
      .catch(() => {
        if (id !== request.current) return;
        setState((prev) => ({ status: "error", cards: prev.cards, error: "" }));
      });
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  return { ...state, retry: load };
}
