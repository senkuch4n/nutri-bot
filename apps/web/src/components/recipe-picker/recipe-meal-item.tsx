"use client";

import { RECIPE_PICKER_TEXT, formatMacroAmount, recipePortionText, scaleMacros } from "@nutri-bot/core";
import type { MealOwnerKind } from "@nutri-bot/db/domain";
import type { MealItemView } from "@/components/meals-editor";
import { MacroLine } from "@/components/recipes/macro-line";
import { RecipePhoto } from "@/components/recipes/recipe-photo";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui";
import { recipePhotoUrl } from "@/lib/recipe-view";
import type { RecipeItemView } from "./types";
import { PortionStepper } from "./portion-stepper";
import { useRecipePortions } from "./use-recipe-item-actions";

/**
 * HU-018c (SDD 7.2): un ítem de receta dentro de una comida del editor. Miniatura, nombre con la marca
 * "Receta", porción casera y kcal, P/C/G, el control de porciones y el "Quitar" de siempre. Los macros
 * siguen al valor optimista de las porciones, así la respuesta al "+" es inmediata.
 */
export function RecipeMealItem({
  item,
  recipe,
  kind,
  ownerId,
  ownerField,
  deleteItemAction,
  showMacros,
  where,
}: {
  item: MealItemView;
  recipe: RecipeItemView;
  kind: MealOwnerKind;
  ownerId: string;
  ownerField: "planId" | "templateId";
  deleteItemAction: (formData: FormData) => Promise<void>;
  showMacros: boolean;
  /** "Desayuno del martes" (para el aria-label de "Quitar"). */
  where: string;
}) {
  const { portions, change } = useRecipePortions(kind, ownerId, item.id, recipe.portions);
  const macros = item.macros && recipe.portions > 0 ? scaleMacros(item.macros, portions / recipe.portions) : null;

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <RecipePhoto
          photoUrl={recipe.photoId ? recipePhotoUrl(recipe.photoId, "panel") : null}
          type={recipe.type}
          alt=""
          sizes="48px"
          className="size-12 w-12 shrink-0 rounded-md [&_svg]:size-6"
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="break-words text-sm font-medium">{recipe.name}</span>
            <Badge tone="info">{RECIPE_PICKER_TEXT.itemBadge}</Badge>
            {recipe.status === "ARCHIVED" ? <Badge>{RECIPE_PICKER_TEXT.archivedBadge}</Badge> : null}
            {recipe.macrosIncomplete ? <Badge tone="warning">{RECIPE_PICKER_TEXT.macrosIncomplete}</Badge> : null}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {recipePortionText(portions, recipe.portionHousehold)}
            {showMacros && macros ? ` · ${formatMacroAmount(macros.kcal, "kcal")}` : null}
          </p>
          {showMacros && macros ? (
            <div className="mt-1">
              <MacroLine macros={macros} />
            </div>
          ) : null}
          {item.notes ? <p className="mt-0.5 text-xs text-muted-foreground">{item.notes}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:pl-0 pl-[3.75rem]">
        <PortionStepper value={portions} onChange={change} recipeName={recipe.name} />
        <form action={deleteItemAction}>
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name={ownerField} value={ownerId} />
          <SubmitButton
            variant="ghost"
            size="sm"
            // HU-018c-2 (revisión de 018c-1): 44 px, como el control de porciones de al lado.
            className="h-11 px-4"
            pendingLabel="Quitando…"
            aria-label={`Quitar ${recipe.name} de ${where}`}
          >
            {RECIPE_PICKER_TEXT.remove}
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}
