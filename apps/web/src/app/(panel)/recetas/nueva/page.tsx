import { recipesForTenant } from "@nutri-bot/db/domain";
import { requirePageContext } from "@/lib/tenant-context";
import { RecipeForm } from "../recipe-form";

export const dynamic = "force-dynamic";

export default async function NuevaRecetaPage() {
  const access = await requirePageContext();
  const foods = await recipesForTenant(access.tenantId).foods();
  return <RecipeForm recipe={null} foods={foods} usage={{ plans: 0, templates: 0 }} />;
}
