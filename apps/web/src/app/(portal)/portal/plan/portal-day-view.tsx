"use client";

import { useState } from "react";
import {
  WEEKDAY_LABELS,
  formatGrams,
  itemsForDay,
  measureAmountText,
  recipePortionText,
  type Macros,
  type Weekday,
} from "@nutri-bot/core";
import type { MealItemView, MealView } from "@/components/meals-editor";
import { MacroTotals } from "@/components/macro-totals";
import { Badge, Card, Quantity } from "@/components/ui";
import { DaySelector } from "@/components/weekly-menu/day-selector";
import { RecipePhoto } from "@/components/recipes/recipe-photo";
import type { RecipeItemView } from "@/components/recipe-picker/types";
import type { PortalRecipeView } from "@/lib/portal-recipe";
import { recipePhotoUrl } from "@/lib/recipe-view";
import { PortalRecipeSheet } from "./portal-recipe-sheet";

/**
 * HU-018c: una receta en el portal. Miniatura, nombre, porción casera y "Fuente: …" (D3 = b). Sin
 * macros ni gramos. HU-018c-2: "Ver receta" abre la receta completa (si llegó su detalle).
 */
function PortalRecipeItem({ recipe, detail }: { recipe: RecipeItemView; detail: PortalRecipeView | null }) {
  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <RecipePhoto
          photoUrl={recipe.photoId ? recipePhotoUrl(recipe.photoId, "portal") : null}
          type={recipe.type}
          alt=""
          sizes="48px"
          className="size-12 w-12 shrink-0 rounded-md [&_svg]:size-6"
        />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium">{recipe.name}</p>
          <p className="text-subheadline text-muted-foreground">
            {recipePortionText(recipe.portions, recipe.portionHousehold)}
          </p>
          {recipe.sourceName ? (
            <p className="text-footnote text-muted-foreground">Fuente: {recipe.sourceName}</p>
          ) : null}
        </div>
      </div>
      {detail ? <PortalRecipeSheet recipe={detail} /> : null}
    </li>
  );
}

/** Lista de ítems de una comida en el portal (la usan la vista por día y la de siempre). */
export function PortalMealItems({
  items,
  recipes = {},
}: {
  items: MealItemView[];
  /** HU-018c-2: detalle de cada receta del plan, por recipeId (sin macros). */
  recipes?: Record<string, PortalRecipeView>;
}) {
  return (
    <ul className="-my-3 divide-y">
      {items.map((item) => item.recipe ? (
        <PortalRecipeItem key={item.id} recipe={item.recipe} detail={recipes[item.recipe.id] ?? null} />
      ) : (
        <li key={item.id} className="flex items-baseline justify-between gap-4 py-3 text-sm">
          <span className="min-w-0 break-words">{item.foodName ?? item.customLabel ?? "—"}</span>
          {item.measure ? (
            // HU-018d (D3 = a): la medida casera y debajo, chico y gris, los gramos.
            <span className="flex shrink-0 flex-col items-end text-right">
              <span className="text-sm">{measureAmountText(item.measure.qty, item.measure)}</span>
              <span className="text-footnote tabular-nums text-muted-foreground">
                {formatGrams(Number(item.quantityGrams))}
              </span>
            </span>
          ) : item.quantityGrams ? (
            <Quantity
              value={Number(item.quantityGrams)}
              unit="g"
              decimals={1}
              className="shrink-0 text-muted-foreground"
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * HU-018b: plan semanal en el portal. Pestañas Lun…Dom con hoy seleccionado (en la zona de la
 * profesional), el total del día y las comidas que valen ese día: las que cambian cada día y las de
 * "Todos los días" (con su marca; las de opciones con "Elegí una"). Cambiar de día es instantáneo:
 * todos los ítems ya llegaron.
 */
export function PortalDayView({
  meals,
  today,
  dayTotals,
  loadedDays,
  recipes,
}: {
  meals: MealView[];
  today: Weekday;
  dayTotals: Record<Weekday, Macros>;
  loadedDays: Weekday[];
  recipes?: Record<string, PortalRecipeView>;
}) {
  const [day, setDay] = useState<Weekday>(today);
  const dayMeals = meals
    .map((meal) => ({ meal, items: itemsForDay(meal, day) }))
    .filter(({ items }) => items.length > 0);

  return (
    <div className="space-y-6">
      <DaySelector
        value={day}
        onValueChange={(next) => {
          if (next !== "WEEK") setDay(next);
        }}
        includeWeek={false}
        loadedDays={loadedDays}
        aria-label="Día del plan"
      />

      <MacroTotals totals={dayTotals[day]} label={`Total del ${WEEKDAY_LABELS[day].lower}`} />

      {dayMeals.length === 0 ? (
        <Card>
          <p className="text-pretty text-sm text-muted-foreground">
            El {WEEKDAY_LABELS[day].lower} todavía no tiene comidas cargadas.
          </p>
        </Card>
      ) : null}

      {dayMeals.map(({ meal, items }) => (
        <Card
          key={meal.id}
          title={meal.name}
          actions={meal.mode === "EVERY_DAY" ? <Badge>Todos los días</Badge> : undefined}
        >
          {meal.isOptions ? (
            <p className="mb-4 text-subheadline font-semibold text-muted-foreground">Elegí una</p>
          ) : null}
          <PortalMealItems items={items} recipes={recipes} />
        </Card>
      ))}
    </div>
  );
}
