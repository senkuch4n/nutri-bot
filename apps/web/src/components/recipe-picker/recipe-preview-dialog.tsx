"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CloudOff } from "lucide-react";
import { RECIPE_PICKER_TEXT } from "@nutri-bot/core";
import type { RecipePreview } from "@nutri-bot/db/domain";
import { getRecipePreviewAction } from "@/app/(panel)/recipe-picker-actions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/primitives/dialog";
import { Skeleton } from "@/components/primitives/skeleton";
import { RecipeDetailBody } from "@/components/recipes/recipe-detail-body";
import { Button, EmptyState } from "@/components/ui";
import type { RecipeCardView } from "@/lib/recipe-view";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; recipe: RecipePreview }
  | { status: "error"; message: string };

/**
 * HU-018c-2 (SDD 7.4): detalle de una receta dentro del buscador. Un Dialog por encima del sheet (Escape
 * cierra primero esto y después el sheet). Pide el detalle con `getRecipePreviewAction` al abrir y lo
 * guarda por id mientras el sheet esté montado, así volver a abrir la misma receta es instantáneo.
 * Abajo, fijo, el mismo pie de la tarjeta: impacto y "Agregar a Desayuno · Martes".
 */
export function RecipePreviewDialog({
  card,
  onClose,
  renderFooter,
}: {
  /** La tarjeta abierta; null = cerrado. */
  card: RecipeCardView | null;
  onClose: () => void;
  renderFooter: (card: RecipeCardView) => ReactNode;
}) {
  const cache = useRef(new Map<string, RecipePreview>());
  const [state, setState] = useState<LoadState>({ status: "loading" });
  // La última tarjeta abierta se conserva durante la animación de salida.
  const [shown, setShown] = useState<RecipeCardView | null>(card);
  if (card && card !== shown) setShown(card);

  const load = useCallback(async (id: string, signal: { cancelled: boolean }) => {
    const cached = cache.current.get(id);
    if (cached) {
      setState({ status: "ready", recipe: cached });
      return;
    }
    setState({ status: "loading" });
    const result = await getRecipePreviewAction(id);
    if (signal.cancelled) return;
    if (result.ok) {
      cache.current.set(id, result.recipe);
      setState({ status: "ready", recipe: result.recipe });
    } else {
      setState({ status: "error", message: result.error });
    }
  }, []);

  const cardId = card?.id ?? null;
  useEffect(() => {
    if (!cardId) return;
    const signal = { cancelled: false };
    void load(cardId, signal).catch(() => {
      if (!signal.cancelled) setState({ status: "error", message: RECIPE_PICKER_TEXT.previewLoadError });
    });
    return () => {
      signal.cancelled = true;
    };
  }, [cardId, load]);

  const retry = () => {
    if (!cardId) return;
    void load(cardId, { cancelled: false }).catch(() =>
      setState({ status: "error", message: RECIPE_PICKER_TEXT.previewLoadError }),
    );
  };

  return (
    <Dialog open={card !== null} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="gap-0 scroll-pb-48 p-0 sm:max-w-2xl" aria-busy={state.status === "loading"}>
        {shown ? (
          <>
            <DialogHeader className="px-6 pb-4 pr-14 pt-6 text-left">
              <DialogTitle className="text-title-2">{shown.name}</DialogTitle>
              <DialogDescription className="sr-only">{RECIPE_PICKER_TEXT.previewDescription}</DialogDescription>
            </DialogHeader>

            <div className="px-6 pb-6">
              {state.status === "ready" && state.recipe.id === shown.id ? (
                <RecipeDetailBody recipe={state.recipe} photoScope="panel" showMacros preparationOpen={false} />
              ) : state.status === "error" ? (
                <EmptyState
                  icon={CloudOff}
                  title={state.message === RECIPE_PICKER_TEXT.notPublished ? state.message : RECIPE_PICKER_TEXT.previewLoadError}
                  action={
                    state.message === RECIPE_PICKER_TEXT.notPublished ? undefined : (
                      <Button size="lg" onClick={retry}>
                        {RECIPE_PICKER_TEXT.retry}
                      </Button>
                    )
                  }
                />
              ) : (
                <PreviewSkeleton />
              )}
            </div>

            <div className="material-bar sticky bottom-0 border-t px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
              {renderFooter(shown)}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Mientras carga: la foto 4:3 reservada (sin salto de diseño) y unas líneas. */
function PreviewSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <Skeleton className="aspect-[4/3] w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
