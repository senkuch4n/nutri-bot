"use client";

import { RECIPE_PICKER_TEXT } from "@nutri-bot/core";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/primitives/sheet";
import { RecipeDetailBody } from "@/components/recipes/recipe-detail-body";
import { Button } from "@/components/ui";
import type { PortalRecipeView } from "@/lib/portal-recipe";

/**
 * HU-018c-2 (SDD 7.6): "Ver receta" en el portal. Abre un panel a la derecha (pantalla completa en el
 * celular, se cierra arrastrando) con la receta completa: foto, ingredientes, preparación (abierta),
 * tips y "Fuente: …" (D3 = b). Sin macros: `PortalRecipeView` ni siquiera los trae.
 */
export function PortalRecipeSheet({ recipe }: { recipe: PortalRecipeView }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" size="lg" className="w-full sm:w-auto" aria-haspopup="dialog">
          {RECIPE_PICKER_TEXT.viewRecipe}
          <span className="sr-only">: {recipe.name}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full p-0 sm:max-w-lg">
        <SheetHeader className="material-bar sticky top-0 z-10 border-b px-5 pb-4 pr-14 pt-5 text-left">
          <SheetTitle className="text-title-2">{recipe.name}</SheetTitle>
          <SheetDescription className="sr-only">{RECIPE_PICKER_TEXT.portalSheetDescription}</SheetDescription>
        </SheetHeader>
        <RecipeDetailBody
          recipe={recipe}
          photoScope="portal"
          showMacros={false}
          preparationOpen
          className="px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5"
        />
      </SheetContent>
    </Sheet>
  );
}
