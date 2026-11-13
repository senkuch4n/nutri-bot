import type { RecipeCard } from "@nutri-bot/db/domain";

// HU-018a: tarjeta de receta lista para dibujar (panel o portal). La URL de la foto depende de dónde
// se muestre: el portal tiene su propia ruta, bajo /portal (la cookie del paciente vive ahí).

export type RecipeCardView = RecipeCard & {
  photoUrl: string | null;
  /** Solo borradores de la carga asistida: "Almuerzos y cenas 2 · pág. 7" (lo arma el server). */
  importLabel?: string | null;
};

export function recipePhotoUrl(
  photoId: string,
  scope: "panel" | "portal",
  size: "thumb" | "full" = "thumb",
): string {
  return scope === "portal"
    ? `/portal/recetas/fotos/${photoId}?size=${size}`
    : `/api/recetas/fotos/${photoId}?size=${size}`;
}

export function toRecipeCardView(card: RecipeCard, scope: "panel" | "portal"): RecipeCardView {
  let photoUrl: string | null = null;
  if (card.photoId) photoUrl = recipePhotoUrl(card.photoId, scope);
  else if (card.draftThumbId && scope === "panel") photoUrl = `/api/recetas/importacion/${card.draftThumbId}?size=thumb`;
  return { ...card, photoUrl };
}
