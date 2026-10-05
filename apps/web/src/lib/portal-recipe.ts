import type { RecipePreview } from "@nutri-bot/db/domain";
import type { MealView } from "@/components/meals-editor";

// HU-018c-2 (SDD 7.6): lo que el portal le manda al navegador del paciente sobre las recetas. D3 = (b):
// el paciente ve la receta completa (foto, ingredientes, preparación, tips y fuente), pero NO los macros.
// Las dos funciones arman objetos nuevos campo por campo: nada que se sume después a RecipePreview o a
// MealItemView viaja al cliente sin que alguien lo agregue acá a propósito.

/** El detalle que recibe el cliente del portal: RecipePreview sin macros ni estado. */
export type PortalRecipeView = Omit<RecipePreview, "perPortion" | "macrosIncomplete" | "status">;

export function toPortalRecipeView(r: RecipePreview): PortalRecipeView {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    portionHousehold: r.portionHousehold,
    yieldPortions: r.yieldPortions,
    photo: r.photo ? { id: r.photo.id, credit: r.photo.credit } : null,
    sourceName: r.sourceName,
    preparation: r.preparation,
    tips: r.tips,
    ingredients: r.ingredients.map((i) => ({
      name: i.name,
      household: i.household,
      grams: i.grams,
      noQuantity: i.noQuantity,
    })),
  };
}

/** `Record<recipeId, PortalRecipeView>` para "Ver receta". */
export function toPortalRecipeMap(previews: readonly RecipePreview[]): Record<string, PortalRecipeView> {
  return Object.fromEntries(previews.map((r) => [r.id, toPortalRecipeView(r)]));
}

/**
 * Las comidas tal como viajan al cliente del portal: los ítems de receta van sin macros ni desglose
 * (la receta no muestra macros al paciente). Los totales del día se calculan en el server ANTES de
 * llamar a esto, así que no cambian. `macrosIncomplete` de la receta tampoco viaja.
 */
export function portalMealsForClient(meals: readonly MealView[]): MealView[] {
  return meals.map((meal) => ({
    ...meal,
    items: meal.items.map((item) =>
      item.recipe
        ? {
            ...item,
            macros: null,
            kcalBreakdown: null,
            recipe: { ...item.recipe, macrosIncomplete: false },
          }
        : item,
    ),
  }));
}
