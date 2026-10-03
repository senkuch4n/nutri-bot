import { listFoodsForRecipes } from "@nutri-bot/db/domain";
import { RecipeForm } from "../recipe-form";

export const dynamic = "force-dynamic";

export default async function NuevaRecetaPage() {
  const foods = await listFoodsForRecipes();
  return <RecipeForm recipe={null} foods={foods} usage={{ plans: 0, templates: 0 }} />;
}
