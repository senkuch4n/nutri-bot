import { notFound, redirect } from "next/navigation";
import { RECIPE_TEXT } from "@nutri-bot/core";
import { getRecipe, getRecipeUsage, listFoodsForRecipes } from "@nutri-bot/db/domain";
import { RecipeForm } from "../recipe-form";

export const dynamic = "force-dynamic";

export default async function RecetaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const recipe = await getRecipe(id);
  if (!recipe) notFound();
  // Los borradores se editan en la pantalla de revisión (018a-2).
  if (recipe.status === "DRAFT") redirect(`/recetas/revisar/${id}`);

  const foodIds = recipe.ingredients.flatMap((i) => (i.food ? [i.food.id] : []));
  const [usage, foods] = await Promise.all([getRecipeUsage(id), listFoodsForRecipes(foodIds)]);

  return (
    <RecipeForm
      recipe={recipe}
      foods={foods}
      usage={usage}
      initialPhotoError={query.foto === "error" ? RECIPE_TEXT.photoSaveError : null}
    />
  );
}
