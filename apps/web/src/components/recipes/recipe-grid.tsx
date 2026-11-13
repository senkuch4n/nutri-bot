import type { ReactNode } from "react";
import type { RecipeCardView } from "@/lib/recipe-view";
import { cn } from "@/lib/utils";
import { RecipeCard } from "./recipe-card";

// HU-018a: grilla de recetas. Las primeras fotos cargan con prioridad; el resto, diferidas.
// HU-018c: `layout="panel"` para el buscador del plan (un panel de 2/3 del ancho: las columnas no
// pueden salir del ancho de la ventana, porque quedarían angostas).

export type RecipeGridLayout = "page" | "panel";

export const RECIPE_GRID_COLUMNS: Record<RecipeGridLayout, string> = {
  page: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
  panel: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
};

const PANEL_SIZES = "(min-width: 1280px) 20vw, (min-width: 640px) 30vw, 100vw";

export function RecipeGrid({
  cards,
  hrefFor = (c) => `/recetas/${c.id}`,
  renderFooter,
  layout = "page",
  onOpen,
  onPreviewChange,
}: {
  cards: readonly RecipeCardView[];
  /** null: la parte de arriba de la tarjeta no es un enlace (buscador del plan). */
  hrefFor?: ((card: RecipeCardView) => string) | null;
  renderFooter?: (card: RecipeCardView) => ReactNode;
  layout?: RecipeGridLayout;
  /** HU-018c-2: tocar la tarjeta abre el detalle (en vez de navegar). */
  onOpen?: (card: RecipeCardView) => void;
  onPreviewChange?: (card: RecipeCardView, active: boolean) => void;
}) {
  const priorityCount = layout === "panel" ? 3 : 4;
  return (
    <ul className={cn("grid gap-4", RECIPE_GRID_COLUMNS[layout])}>
      {cards.map((card, i) => (
        <li key={card.id} className="flex [&>article]:flex-1">
          <RecipeCard
            card={card}
            href={onOpen || !hrefFor ? undefined : hrefFor(card)}
            onOpen={onOpen ? () => onOpen(card) : undefined}
            footer={renderFooter?.(card)}
            priority={i < priorityCount}
            sizes={layout === "panel" ? PANEL_SIZES : undefined}
            onPreviewChange={onPreviewChange ? (active) => onPreviewChange(card, active) : undefined}
          />
        </li>
      ))}
    </ul>
  );
}
