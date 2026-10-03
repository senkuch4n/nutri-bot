import type { RecipeStatusKey, RecipeTypeKey } from "@nutri-bot/core";
import type { RecipeCardView } from "@/lib/recipe-view";

// HU-018c: tipos del buscador de recetas. Viven acá (y no en `recipe-picker-actions.ts`) porque un
// archivo "use server" solo puede exportar funciones async (Turbopack rechaza tipos re-exportados).

export type PickerActionError = { ok: false; error: string };
export type ListPickerRecipesResult = { ok: true; cards: RecipeCardView[] } | PickerActionError;
export type AddRecipeResult = { ok: true; itemIds: string[] } | PickerActionError;
export type PickerMutationResult = { ok: true } | PickerActionError;

/** La receta de un ítem del plan, tal como la dibujan el editor, el portal y el PDF (SDD 8.1). */
export interface RecipeItemView {
  /** recipeId */
  id: string;
  name: string;
  status: RecipeStatusKey;
  type: RecipeTypeKey | null;
  portions: number;
  portionHousehold: string | null;
  photoId: string | null;
  sourceName: string | null;
  macrosIncomplete: boolean;
}
