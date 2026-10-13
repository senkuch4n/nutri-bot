"use client";

import { useState } from "react";
import { m } from "motion/react";
import { ChevronRight } from "lucide-react";
import {
  RECIPE_PICKER_TEXT,
  WEEKDAY_LABELS,
  formatGrams,
  itemsForDay,
  measureAmountText,
  recipePortionText,
  type Weekday,
} from "@nutri-bot/core";
import type { MealItemView, MealView } from "@/components/meals-editor";
import { Card, Quantity } from "@/components/ui";
import { DaySelector } from "@/components/weekly-menu/day-selector";
import { RecipePhoto } from "@/components/recipes/recipe-photo";
import type { RecipeItemView } from "@/components/recipe-picker/types";
import type { PortalRecipeView } from "@/lib/portal-recipe";
import { fades } from "@/lib/motion";
import { recipePhotoUrl } from "@/lib/recipe-view";
import { PortalRecipeSheet } from "./portal-recipe-sheet";

// HU-017d-3: el plan en el portal, sin kcal ni macros en ninguna parte (D1).

/** Miniatura, nombre, porción casera y "Fuente: …" de una receta (HU-018c, D3 = b). */
function RecipeSummary({ recipe }: { recipe: RecipeItemView }) {
  return (
    <>
      <RecipePhoto
        photoUrl={recipe.photoId ? recipePhotoUrl(recipe.photoId, "portal") : null}
        type={recipe.type}
        alt=""
        sizes="48px"
        className="size-12 w-12 shrink-0 rounded-lg [&_svg]:size-6"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="break-words text-body-lg font-medium">{recipe.name}</span>
        <span className="text-subheadline text-muted-foreground">
          {recipePortionText(recipe.portions, recipe.portionHousehold)}
        </span>
        {recipe.sourceName ? (
          <span className="text-footnote text-muted-foreground">Fuente: {recipe.sourceName}</span>
        ) : null}
      </span>
    </>
  );
}

/**
 * Una receta del plan. D13: con detalle, la fila entera es el botón que abre "Ver receta" (alto mínimo
 * 64 px). Sin detalle, la fila no es tocable y no dice "Ver receta".
 */
function PortalRecipeItem({ recipe, detail }: { recipe: RecipeItemView; detail: PortalRecipeView | null }) {
  if (!detail) {
    return (
      <li className="flex min-h-16 items-center gap-3 py-3">
        <RecipeSummary recipe={recipe} />
      </li>
    );
  }
  return (
    <li className="py-1">
      <PortalRecipeSheet
        recipe={detail}
        trigger={
          <button
            type="button"
            className="-mx-2 flex min-h-16 w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2 text-left press-none transition-colors hover:bg-overlay-hover pressed:bg-overlay-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring"
          >
            <RecipeSummary recipe={recipe} />
            <span className="inline-flex shrink-0 items-center gap-1 text-callout font-medium text-primary">
              {RECIPE_PICKER_TEXT.viewRecipe}
              <ChevronRight className="size-4" aria-hidden />
            </span>
          </button>
        }
      />
    </li>
  );
}

/** Un alimento: el nombre a la izquierda (puede bajar de renglón) y la cantidad a la derecha. */
function PortalFoodItem({ item }: { item: MealItemView }) {
  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <span className="min-w-0 flex-1 break-words text-body-lg">{item.foodName ?? item.customLabel ?? "—"}</span>
      {item.measure ? (
        // HU-018d (D3 = a): la medida casera y debajo, chico y gris, los gramos.
        <span className="flex shrink-0 flex-col items-end text-right">
          <span className="text-body-lg">{measureAmountText(item.measure.qty, item.measure)}</span>
          <span className="text-footnote tabular-nums text-muted-foreground">
            {formatGrams(Number(item.quantityGrams))}
          </span>
        </span>
      ) : item.quantityGrams ? (
        // D15: hasta un decimal, sin ceros de más ("120 g", "37,5 g"), como el PDF.
        <Quantity value={Number(item.quantityGrams)} unit="g" decimals={1} className="shrink-0 text-right text-body-lg" />
      ) : null}
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
      {items.map((item) =>
        item.recipe ? (
          <PortalRecipeItem key={item.id} recipe={item.recipe} detail={recipes[item.recipe.id] ?? null} />
        ) : (
          <PortalFoodItem key={item.id} item={item} />
        ),
      )}
    </ul>
  );
}

/** Una comida: tarjeta con su nombre, "Todos los días" en texto (sin badge) y, si es de opciones, el aviso. */
export function PortalMealCard({
  meal,
  items,
  recipes,
}: {
  meal: MealView;
  items: MealItemView[];
  recipes?: Record<string, PortalRecipeView>;
}) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-headline">{meal.name}</h3>
        {meal.mode === "EVERY_DAY" ? (
          <span className="text-subheadline text-muted-foreground">Todos los días</span>
        ) : null}
      </div>
      {meal.isOptions ? (
        <p className="mb-2 text-subheadline font-semibold text-muted-foreground">Elegí una de estas opciones</p>
      ) : null}
      <PortalMealItems items={items} recipes={recipes} />
    </Card>
  );
}

/**
 * HU-018b + 017d-3: plan semanal en el portal. Selector Lun…Dom con hoy elegido y marcado "Hoy", el
 * nombre del día y sus comidas (las que cambian cada día y las de "Todos los días"). Cambiar de día es
 * instantáneo (todos los ítems ya llegaron) y las comidas entran con un fundido corto. La primera
 * pintada no anima: el HTML del servidor tiene que verse sin esperar a la hidratación.
 */
export function PortalDayView({
  meals,
  today,
  loadedDays,
  recipes,
}: {
  meals: MealView[];
  today: Weekday;
  loadedDays: Weekday[];
  recipes?: Record<string, PortalRecipeView>;
}) {
  const [day, setDay] = useState<Weekday>(today);
  const [changed, setChanged] = useState(false);
  const dayMeals = meals
    .map((meal) => ({ meal, items: itemsForDay(meal, day) }))
    .filter(({ items }) => items.length > 0);

  return (
    <div className="space-y-4">
      <DaySelector
        value={day}
        onValueChange={(next) => {
          if (next === "WEEK") return;
          setDay(next);
          setChanged(true);
        }}
        includeWeek={false}
        loadedDays={loadedDays}
        today={today}
        aria-label="Día del plan"
      />

      <h2 className="pt-2 text-title-3">{WEEKDAY_LABELS[day].long}</h2>

      <m.div
        key={day}
        initial={changed ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={fades.fast}
        className="space-y-4"
      >
        {dayMeals.length === 0 ? (
          <Card>
            <p className="text-pretty text-body-lg text-muted-foreground">
              El {WEEKDAY_LABELS[day].lower} no tiene comidas cargadas. Mirá otro día o preguntale a tu nutricionista.
            </p>
          </Card>
        ) : (
          dayMeals.map(({ meal, items }) => (
            <PortalMealCard key={meal.id} meal={meal} items={items} recipes={recipes} />
          ))
        )}
      </m.div>
    </div>
  );
}
