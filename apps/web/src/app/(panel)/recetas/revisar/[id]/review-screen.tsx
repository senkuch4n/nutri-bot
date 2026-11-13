"use client";

import { useCallback, useMemo } from "react";
import { foodSearchText } from "@nutri-bot/core";
import { parseIngredientLine, suggestFood, type SuggestableFood } from "@nutri-bot/core/recipe-import";
import type { RecipeCatalogFood, RecipeDetail } from "@nutri-bot/db/domain";
import { RecipeForm, type RecipeReviewProps } from "../../recipe-form";
import { discardDraftAction, publishDraftAction, saveDraftAction } from "../actions";
import { flagMessages, type RecipeReview } from "./review-parts";

// HU-018a-2 (SDD 7.5): pantalla de revisión. Arma el modo "review" de RecipeForm: la sugerencia de
// alimento (suggestFood, en el cliente, 12-D12) y los avisos del parser por línea. El parser solo
// entra al bundle de esta pantalla.

export function ReviewScreen({
  recipe,
  foods,
  review,
}: {
  recipe: RecipeDetail;
  foods: RecipeCatalogFood[];
  review: RecipeReview;
}) {
  const catalog = useMemo<SuggestableFood[]>(
    () => foods.map((f) => ({ id: f.id, name: f.name, searchText: foodSearchText(f.name), source: f.source, active: f.active })),
    [foods],
  );
  const suggest = useCallback((label: string) => suggestFood(label, catalog), [catalog]);
  const flagsFor = useCallback((rawText: string) => flagMessages(parseIngredientLine(rawText).flags), []);
  const props = useMemo<RecipeReviewProps>(
    () => ({
      ...review,
      suggest,
      flagsFor,
      saveDraft: saveDraftAction,
      publish: publishDraftAction,
      discard: discardDraftAction,
    }),
    [review, suggest, flagsFor],
  );

  // key: al pasar al siguiente borrador el formulario arranca de cero.
  return <RecipeForm key={recipe.id} recipe={recipe} foods={foods} usage={{ plans: 0, templates: 0 }} review={props} />;
}
