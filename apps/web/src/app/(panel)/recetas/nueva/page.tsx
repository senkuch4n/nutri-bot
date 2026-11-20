import { notFound } from "next/navigation";
import { recipesForTenant } from "@nutri-bot/db/domain";
import { resolvePrivateContentAccess } from "@/lib/private-content-access";
import { RecipeForm } from "../recipe-form";

export const dynamic = "force-dynamic";

export default async function NuevaRecetaPage() {
  const access = await resolvePrivateContentAccess();
  if (!access) notFound();
  const foods = await recipesForTenant(access.tenantId).foods();
  return <RecipeForm recipe={null} foods={foods} usage={{ plans: 0, templates: 0 }} />;
}
