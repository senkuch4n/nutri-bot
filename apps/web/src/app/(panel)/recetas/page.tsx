import { Plus } from "lucide-react";
import type { RecipeStatusKey } from "@nutri-bot/core";
import { countRecipesByStatus, listRecipeCards } from "@nutri-bot/db/domain";
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
  const tab = parseTab((await searchParams).estado);
  const [cards, counts] = await Promise.all([listRecipeCards({ status: TAB_STATUS[tab] }), countRecipesByStatus()]);

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
        cards={cards.map((c) => toRecipeCardView(c, "panel"))}
      />
    </div>
  );
}
