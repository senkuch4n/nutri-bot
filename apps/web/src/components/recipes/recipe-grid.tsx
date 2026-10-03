import type { ReactNode } from "react";
import type { RecipeCardView } from "@/lib/recipe-view";
import { RecipeCard } from "./recipe-card";

// HU-018a: grilla de recetas. Las primeras 4 fotos cargan con prioridad; el resto, diferidas.

export function RecipeGrid({
  cards,
  hrefFor = (c) => `/recetas/${c.id}`,
  renderFooter,
}: {
  cards: readonly RecipeCardView[];
  hrefFor?: (card: RecipeCardView) => string;
  renderFooter?: (card: RecipeCardView) => ReactNode;
}) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {cards.map((card, i) => (
        <li key={card.id} className="flex [&>article]:flex-1">
          <RecipeCard card={card} href={hrefFor(card)} footer={renderFooter?.(card)} priority={i < 4} />
        </li>
      ))}
    </ul>
  );
}
