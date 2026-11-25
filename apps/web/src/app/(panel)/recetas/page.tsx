import { Plus } from "lucide-react";
import type { RecipeStatusKey } from "@nutri-bot/core";
import { recipeFileTitle } from "@nutri-bot/core/recipe-import";
import { recipesForTenant } from "@nutri-bot/db/domain";
import { requirePageContext } from "@/lib/tenant-context";
import { ButtonLink, PageHeader } from "@/components/ui";
import { toRecipeCardView } from "@/lib/recipe-view";
import { RecipesBrowser, type RecipeTab } from "./recipes-browser";

export const dynamic = "force-dynamic";

const TAB_STATUS: Record<RecipeTab, RecipeStatusKey> = {
  publicadas: "PUBLISHED",
  revisar: "DRAFT",
  archivadas: "ARCHIVED",
};

function parseTab(raw: string | string[] | undefined): RecipeTab {
  return raw === "revisar" || raw === "archivadas" ? raw : "publicadas";
}

export default async function RecetasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requirePageContext();
  const recipes = recipesForTenant(access.tenantId);
  const tab = parseTab((await searchParams).estado);
  const [cards, counts] = await Promise.all([recipes.list(TAB_STATUS[tab]), recipes.counts()]);

  return (
    <div>
      <PageHeader
        title="Recetas"
        description="Tus recetas con los macros de 1 porción, calculados con SARA 2."
        action={
          <ButtonLink href="/recetas/nueva" size="lg">
            <Plus aria-hidden />
            Nueva receta
          </ButtonLink>
        }
      />
      <RecipesBrowser
        tab={tab}
        counts={{ publicadas: counts.PUBLISHED, revisar: counts.DRAFT, archivadas: counts.ARCHIVED }}
        cards={cards.map((c) => ({
          ...toRecipeCardView(c, "panel"),
          importLabel:
            c.status === "DRAFT" && c.importFile
              ? `${recipeFileTitle(c.importFile)}${c.importPage ? ` · pág. ${c.importPage}` : ""}`
              : null,
        }))}
      />
    </div>
  );
}
