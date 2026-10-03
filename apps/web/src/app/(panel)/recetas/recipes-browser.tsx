"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, SearchX } from "lucide-react";
import {
  EMPTY_RECIPE_FILTERS,
  filterRecipes,
  hasActiveRecipeFilters,
  recipeCountText,
  type RecipeFilters as Filters,
} from "@nutri-bot/core";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/primitives/tabs";
import { RecipeFilters } from "@/components/recipes/recipe-filters";
import { RecipeGrid } from "@/components/recipes/recipe-grid";
import { Button, ButtonLink, EmptyState } from "@/components/ui";
import type { RecipeCardView } from "@/lib/recipe-view";
import { cn } from "@/lib/utils";

// HU-018a: pestañas (en la URL, así "atrás" funciona) + buscador y chips (estado local, filtrado en
// el cliente sin botón "Buscar").

export type RecipeTab = "publicadas" | "revisar" | "archivadas";

const TAB_LABELS: Record<RecipeTab, string> = {
  publicadas: "Publicadas",
  revisar: "Para revisar",
  archivadas: "Archivadas",
};

export function RecipesBrowser({
  tab,
  counts,
  cards,
}: {
  tab: RecipeTab;
  counts: Record<RecipeTab, number>;
  cards: RecipeCardView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filters, setFilters] = useState<Filters>(EMPTY_RECIPE_FILTERS);
  const deferredQuery = useDeferredValue(filters.query);
  const shown = useMemo(
    () => filterRecipes(cards, { ...filters, query: deferredQuery }),
    [cards, filters, deferredQuery],
  );
  const filtered = hasActiveRecipeFilters(filters);

  // "Para revisar" y "Archivadas" solo aparecen si tienen recetas (o si se está parado ahí).
  const tabs = (Object.keys(TAB_LABELS) as RecipeTab[]).filter(
    (t) => t === "publicadas" || counts[t] > 0 || t === tab,
  );

  function changeTab(next: string) {
    startTransition(() => {
      router.replace(next === "publicadas" ? "/recetas" : `/recetas?estado=${next}`, { scroll: false });
    });
  }

  const totalAll = counts.publicadas + counts.revisar + counts.archivadas;

  let content;
  if (totalAll === 0) {
    content = (
      <EmptyState
        icon={BookOpen}
        title="Todavía no hay recetas. Cargá la primera."
        action={
          <ButtonLink href="/recetas/nueva" size="lg">
            Nueva receta
          </ButtonLink>
        }
      />
    );
  } else if (cards.length === 0) {
    content = <EmptyState icon={BookOpen} title={`No hay recetas ${tab === "archivadas" ? "archivadas" : tab === "revisar" ? "para revisar" : "publicadas"}.`} />;
  } else if (shown.length === 0) {
    const query = filters.query.trim();
    content = (
      <EmptyState
        icon={SearchX}
        title={query ? `No hay recetas con «${query}».` : "No hay recetas con esos filtros."}
        description="Probá con otro ingrediente."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {filtered ? (
              <Button type="button" size="lg" onClick={() => setFilters(EMPTY_RECIPE_FILTERS)}>
                Quitar filtros
              </Button>
            ) : null}
            <ButtonLink href="/recetas/nueva" variant="secondary" size="lg">
              Crear receta
            </ButtonLink>
          </div>
        }
      />
    );
  } else {
    content = <RecipeGrid cards={shown} />;
  }

  return (
    <Tabs value={tab} onValueChange={changeTab}>
      {tabs.length > 1 ? (
        <TabsList aria-label="Estado de las recetas" className="mb-6">
          {tabs.map((t) => (
            <TabsTrigger key={t} value={t}>
              {TAB_LABELS[t]}
              <span className="ml-1.5 tabular-nums text-muted-foreground">{counts[t]}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      ) : null}
      <TabsContent value={tab} className={cn("mt-0 space-y-6", pending && "opacity-60")} aria-busy={pending || undefined}>
        {cards.length > 0 ? (
          <RecipeFilters
            value={filters}
            onChange={setFilters}
            onClear={() => setFilters(EMPTY_RECIPE_FILTERS)}
            countText={recipeCountText(shown.length, cards.length, filtered)}
          />
        ) : null}
        {content}
      </TabsContent>
    </Tabs>
  );
}
