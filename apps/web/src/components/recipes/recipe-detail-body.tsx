import { ChevronDown } from "lucide-react";
import {
  RECIPE_PICKER_TEXT,
  formatIngredientAmount,
  formatMacroAmount,
  recipePhotoCreditText,
  recipeSourceText,
  recipeYieldText,
  type Macros,
} from "@nutri-bot/core";
import type { PortalRecipeView } from "@/lib/portal-recipe";
import { recipePhotoUrl } from "@/lib/recipe-view";
import { cn } from "@/lib/utils";
import { MacroLine } from "./macro-line";
import { RecipePhoto } from "./recipe-photo";

/**
 * HU-018c-2 (SDD 7.1): cuerpo del detalle de una receta, compartido por el diálogo del buscador (panel)
 * y "Ver receta" del portal. Foto grande 4:3, rendimiento y porción, ingredientes (nombre a la izquierda,
 * medida a la derecha; dos columnas desde md), preparación en un <details>, tips, "Fuente: …" y
 * "Foto: …". Sin hooks: se puede dibujar en el server o en el cliente.
 *
 * `showMacros` solo vale en el panel. En el portal el dato ni siquiera llega (PortalRecipeView no tiene
 * `perPortion`).
 */
export function RecipeDetailBody({
  recipe,
  photoScope,
  showMacros,
  preparationOpen,
  className,
}: {
  recipe: PortalRecipeView & { perPortion?: Macros | null };
  photoScope: "panel" | "portal";
  showMacros: boolean;
  preparationOpen: boolean;
  className?: string;
}) {
  const yieldText = recipeYieldText(recipe.yieldPortions);
  const portionText = recipe.portionHousehold?.trim() ? `1 porción: ${recipe.portionHousehold.trim()}` : null;
  const sourceText = recipeSourceText(recipe.sourceName);
  const creditText = recipe.photo ? recipePhotoCreditText(recipe.photo.credit) : null;
  const perPortion = showMacros ? (recipe.perPortion ?? null) : null;
  const preparation = recipe.preparation?.trim() ?? "";
  const tips = recipe.tips?.trim() ?? "";

  return (
    <div className={cn("space-y-6", className)}>
      <div className="space-y-3">
        <RecipePhoto
          photoUrl={recipe.photo ? recipePhotoUrl(recipe.photo.id, photoScope, "full") : null}
          type={recipe.type}
          alt={recipe.photo ? recipe.name : ""}
          sizes="(min-width: 640px) 42rem, 100vw"
          priority
          className="rounded-xl"
        />
        {yieldText || portionText ? (
          <p className="text-callout text-muted-foreground">{[yieldText, portionText].filter(Boolean).join(" · ")}</p>
        ) : null}
        {perPortion ? (
          <div className="space-y-1">
            <p className="text-title-3 tabular-nums">
              {formatMacroAmount(perPortion.kcal, "kcal")}{" "}
              <span className="text-callout font-normal text-muted-foreground">por porción</span>
            </p>
            <MacroLine macros={perPortion} size="callout" />
          </div>
        ) : null}
      </div>

      {recipe.ingredients.length > 0 ? (
        <section aria-labelledby={`ingredientes-${recipe.id}`} className="space-y-2">
          <h3 id={`ingredientes-${recipe.id}`} className="text-headline">
            {RECIPE_PICKER_TEXT.ingredientsTitle}
          </h3>
          <ul className="grid grid-cols-1 md:grid-cols-2 md:gap-x-8">
            {recipe.ingredients.map((ing, i) => {
              const amount = formatIngredientAmount(ing);
              return (
                <li
                  key={`${i}-${ing.name}`}
                  className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2.5 text-body"
                >
                  <span className="min-w-0 break-words">{ing.name}</span>
                  {amount ? (
                    <span className="shrink-0 text-right tabular-nums text-muted-foreground">{amount}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {preparation ? (
        <details open={preparationOpen} className="group/prep">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md text-headline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            {RECIPE_PICKER_TEXT.preparationTitle}
            <ChevronDown
              className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open/prep:rotate-180 motion-reduce:transition-none"
              aria-hidden
            />
          </summary>
          <p className="mt-2 max-w-prose whitespace-pre-line text-pretty text-body leading-relaxed">{preparation}</p>
        </details>
      ) : null}

      {tips ? (
        <section aria-labelledby={`tips-${recipe.id}`} className="space-y-2">
          <h3 id={`tips-${recipe.id}`} className="text-headline">
            {RECIPE_PICKER_TEXT.tipsTitle}
          </h3>
          <p className="max-w-prose whitespace-pre-line text-pretty text-body leading-relaxed">{tips}</p>
        </section>
      ) : null}

      {sourceText || creditText ? (
        <div className="space-y-0.5 border-t border-border/60 pt-3 text-footnote text-muted-foreground">
          {sourceText ? <p>{sourceText}</p> : null}
          {creditText ? <p>{creditText}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
