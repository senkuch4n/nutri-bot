"use client";

import { RECIPE_PICKER_TEXT } from "@nutri-bot/core";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/primitives/sheet";
import { RecipeDetailBody } from "@/components/recipes/recipe-detail-body";
import type { PortalRecipeView } from "@/lib/portal-recipe";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

/**
 * HU-018c-2 (SDD 7.6): "Ver receta" en el portal, con la receta completa: foto, ingredientes,
 * preparación (abierta), tips y "Fuente: …". Sin macros: `PortalRecipeView` ni siquiera los trae.
 * HU-017d-3 (D12, D13): en el celular es un sheet inferior con agarre (el encabezado también arrastra);
 * desde 768 px, el panel a la derecha de 018c-2. `trigger` es un elemento que arma el cliente (la fila
 * entera de la receta), nunca una función (T9a).
 */
export function PortalRecipeSheet({ recipe, trigger }: { recipe: PortalRecipeView; trigger: React.ReactElement }) {
  const compact = useMediaQuery("(max-width: 767px)");
  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side={compact ? "bottom" : "right"}
        // La X (el único botón hijo directo del panel) y el agarre (el único hijo directo aria-hidden)
        // quedan arriba del encabezado sticky (z-10): si no, el encabezado los tapa, la X no se puede
        // tocar y el agarre no se ve.
        className={cn(
          "theme-portal p-0 [&>[aria-hidden=true]]:z-20 [&>button]:z-20",
          compact ? "pt-0" : "w-full sm:max-w-lg",
        )}
      >
        <SheetHeader
          className={cn(
            "material-bar sticky top-0 z-10 border-b px-5 pb-4 pr-14 text-left",
            compact ? "pt-7" : "pt-5",
          )}
        >
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
