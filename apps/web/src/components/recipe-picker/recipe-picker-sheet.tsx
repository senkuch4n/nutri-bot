"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { BookOpen, CloudOff, ExternalLink, SearchX } from "lucide-react";
import {
  EMPTY_RECIPE_FILTERS,
  PICKER_SUGGESTED_INGREDIENTS,
  RECIPE_PICKER_TEXT,
  WEEKDAYS,
  WEEKDAY_LABELS,
  addAriaLabel,
  addButtonLabel,
  computeRecipeImpact,
  computeWeeklyTotals,
  daysMissingRecipe,
  filterRecipes,
  formatRecipeImpact,
  hasActiveRecipeFilters,
  initialPickerFilters,
  pickerDaysHint,
  pickerScope,
  pickerTitle,
  prepareRecipeImpact,
  recipeAddedMessage,
  recipeCountText,
  scopeForDaysToAdd,
  type Macros,
  type PickerScope,
  type RecipeFilters as Filters,
  type RecipeImpactContext,
  type Weekday,
} from "@nutri-bot/core";
import type { MealOwnerKind } from "@nutri-bot/db/domain";
import type { MealView } from "@/components/meals-editor";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/primitives/sheet";
import { ChipGroup } from "@/components/recipes/chip-group";
import { RecipeFilters } from "@/components/recipes/recipe-filters";
import { RecipeGrid } from "@/components/recipes/recipe-grid";
import { RecipeGridSkeleton } from "@/components/recipes/recipe-grid-skeleton";
import { Button, ButtonLink, EmptyState } from "@/components/ui";
import type { PlanTargetView } from "@/components/weekly-menu/day-target-strip";
import type { RecipeCardView } from "@/lib/recipe-view";
import { PickerCardFooter, type PickerCardImpactView } from "./picker-card-footer";
import { PickerDayStrip } from "./picker-day-strip";
import { RecipePreviewDialog } from "./recipe-preview-dialog";
import { usePickerRecipes } from "./use-picker-recipes";
import { useRecipeItemActions, useRecipePortions } from "./use-recipe-item-actions";

const DAY_OPTIONS = WEEKDAYS.map((d) => ({ value: d, label: WEEKDAY_LABELS[d].short, ariaLabel: WEEKDAY_LABELS[d].long }));
const suggestionClass =
  "inline-flex h-11 items-center rounded-full border border-border bg-background px-4 text-callout font-medium press-sm touch-target hover:bg-overlay-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Qué recetas ya están en la comida, para el estado "Agregada" y para no duplicar. */
function recipeItemsOf(meal: MealView) {
  return meal.items.map((i) => ({ id: i.id, weekday: i.weekday, recipeId: i.recipe?.id ?? null, portions: i.recipe?.portions ?? null }));
}

function stripTitle(scope: PickerScope): string {
  if (scope.kind === "DAYS") return WEEKDAY_LABELS[scope.focusDay].long;
  return scope.kind === "EVERY_DAY" ? RECIPE_PICKER_TEXT.stripWeek : RECIPE_PICKER_TEXT.stripPlan;
}

function referenceTotals(meals: readonly MealView[], scope: PickerScope): Macros {
  const totals = computeWeeklyTotals(meals);
  if (scope.kind === "DAYS") return totals.days[scope.focusDay].macros;
  if (scope.kind === "EVERY_DAY") return totals.weeklyAverage ?? totals.days.MON.macros;
  return totals.days.MON.macros;
}

/**
 * HU-018c (SDD 7.3): buscador "Agregar a Desayuno · Martes". Sheet modal a la derecha (2/3 del ancho
 * en escritorio, pantalla completa en el celular), con la franja del día repetida arriba, buscador y
 * chips, "Agregar en:" (solo comidas que cambian cada día) y la grilla con el impacto de cada receta.
 * "Agregar" suma 1 porción sin cerrar el panel.
 */
export function RecipePickerSheet({
  open,
  onOpenChange,
  kind,
  ownerId,
  meals,
  mealId,
  focusDay,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: MealOwnerKind;
  ownerId: string;
  meals: MealView[];
  mealId: string | null;
  /** Día de la pestaña (comidas que cambian cada día) o null. */
  focusDay: Weekday | null;
  /** Objetivo del paciente; null en plantillas o sin prescripción (sin impacto, D17). */
  target: PlanTargetView | null;
}) {
  const meal = meals.find((m) => m.id === mealId) ?? null;
  const recipes = usePickerRecipes(open);
  const inputRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_RECIPE_FILTERS);
  const [markedDays, setMarkedDays] = useState<Weekday[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  // HU-018c-2: receta abierta en el detalle (el sheet no se desmonta: la grilla queda en su lugar).
  const [detailCard, setDetailCard] = useState<RecipeCardView | null>(null);

  // Los filtros y los días se reinician cada vez que se abre (o se abre para otra comida u otro día).
  const mealName = meal?.name ?? "";
  useEffect(() => {
    if (!open) return;
    setFilters(initialPickerFilters(mealName));
    setMarkedDays(focusDay ? [focusDay] : []);
    setPreviewId(null);
    setDetailCard(null);
  }, [open, mealId, focusDay, mealName]);

  // Si la comida desaparece (se borró en otra pestaña), el buscador se cierra.
  useEffect(() => {
    if (open && mealId && !meal) onOpenChange(false);
  }, [open, mealId, meal, onOpenChange]);

  const scope = useMemo<PickerScope | null>(
    () => (meal ? pickerScope(meals, meal, focusDay, markedDays) : null),
    [meals, meal, focusDay, markedDays],
  );
  const impactCtx = useMemo<RecipeImpactContext | null>(
    () => (meal && scope ? prepareRecipeImpact({ meals, mealId: meal.id, scope, target }) : null),
    [meals, meal, scope, target],
  );

  const deferredQuery = useDeferredValue(filters.query);
  const cards = useMemo(() => recipes.cards ?? [], [recipes.cards]);
  const shown = useMemo(() => filterRecipes(cards, { ...filters, query: deferredQuery }), [cards, filters, deferredQuery]);

  const previewCard = previewId ? cards.find((c) => c.id === previewId) : undefined;
  const preview = impactCtx && previewCard?.perPortion ? computeRecipeImpact(impactCtx, previewCard.perPortion) : null;

  const title = meal && scope ? pickerTitle(meal.name, scope) : RECIPE_PICKER_TEXT.openButton;
  const chipsActive = filters.type !== null || filters.moment !== null || filters.tags.length > 0;

  let body: ReactNode;
  if (!meal || !scope) {
    body = null;
  } else if (recipes.cards === null && recipes.status !== "error") {
    body = <RecipeGridSkeleton layout="panel" count={6} />;
  } else if (recipes.cards === null && recipes.status === "error") {
    body = (
      <EmptyState
        icon={CloudOff}
        title={RECIPE_PICKER_TEXT.loadError}
        action={
          <Button size="lg" onClick={recipes.retry}>
            {RECIPE_PICKER_TEXT.retry}
          </Button>
        }
      />
    );
  } else if (cards.length === 0) {
    body = (
      <EmptyState
        icon={BookOpen}
        title={RECIPE_PICKER_TEXT.emptyCatalog}
        action={
          <ButtonLink href="/recetas" size="lg">
            {RECIPE_PICKER_TEXT.goToRecipes}
          </ButtonLink>
        }
      />
    );
  } else if (shown.length === 0) {
    const query = filters.query.trim();
    body = (
      <div className="flex flex-col items-center gap-4 pb-6">
        <EmptyState
          icon={SearchX}
          title={query ? RECIPE_PICKER_TEXT.noResultsQuery.replace("{query}", query) : RECIPE_PICKER_TEXT.noResultsFilters}
        />
        {query ? (
          <div className="-mt-8 flex flex-col items-center gap-2">
            <p className="text-subheadline text-muted-foreground">{RECIPE_PICKER_TEXT.tryAnother}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {PICKER_SUGGESTED_INGREDIENTS.map((word) => (
                <button key={word} type="button" className={suggestionClass} onClick={() => setFilters((f) => ({ ...f, query: word }))}>
                  {word}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-center gap-2">
          {chipsActive ? (
            <Button size="lg" onClick={() => setFilters((f) => ({ ...EMPTY_RECIPE_FILTERS, query: f.query }))}>
              {RECIPE_PICKER_TEXT.clearFilters}
            </Button>
          ) : null}
          {query ? (
            <a
              href="/recetas/nueva"
              target="_blank"
              rel="noopener"
              aria-label={RECIPE_PICKER_TEXT.createRecipeAria}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-secondary px-5 text-base font-semibold text-foreground press touch-target hover:bg-fill-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {RECIPE_PICKER_TEXT.createRecipe}
              <ExternalLink className="size-4" aria-hidden />
            </a>
          ) : null}
        </div>
      </div>
    );
  } else {
    body = (
      <RecipeGrid
        cards={shown}
        hrefFor={null}
        layout="panel"
        onOpen={setDetailCard}
        onPreviewChange={(card, active) =>
          setPreviewId((prev) => (active ? card.id : prev === card.id ? null : prev))
        }
        renderFooter={(card) => (
          <PickerCard
            card={card}
            kind={kind}
            ownerId={ownerId}
            meals={meals}
            meal={meal}
            scope={scope}
            impactCtx={impactCtx}
            target={target}
          />
        )}
      />
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full scroll-pt-60 p-0 sm:max-w-none md:w-[min(66vw,64rem)] md:scroll-pt-48"
        onOpenAutoFocus={(e) => {
          // En pantallas táctiles no se abre el teclado solo: taparía la grilla (13-D7).
          if (window.matchMedia("(pointer: fine)").matches) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        <SheetHeader className="material-bar sticky top-0 z-10 gap-3 border-b px-4 pb-3 pt-5 text-left sm:px-6">
          <div className="flex items-start justify-between gap-3 pr-10">
            <SheetTitle className="text-title-3">{title}</SheetTitle>
            <Button variant="secondary" size="lg" className="shrink-0" onClick={() => onOpenChange(false)}>
              {RECIPE_PICKER_TEXT.done}
            </Button>
          </div>
          <SheetDescription className="sr-only">
            Buscá una receta y agregala a la comida. El panel queda abierto para agregar otras.
          </SheetDescription>
          {kind === "plan" && meal && scope ? (
            <PickerDayStrip
              title={stripTitle(scope)}
              totals={impactCtx ? impactCtx.before : referenceTotals(meals, scope)}
              preview={preview ? preview.after : null}
              target={target}
            />
          ) : null}
        </SheetHeader>

        {meal && scope ? (
          <div className="space-y-4 px-4 py-4 sm:px-6">
            <RecipeFilters
              value={filters}
              onChange={setFilters}
              onClear={() => setFilters(EMPTY_RECIPE_FILTERS)}
              countText={recipeCountText(shown.length, cards.length, hasActiveRecipeFilters(filters))}
              placeholder={RECIPE_PICKER_TEXT.searchPlaceholder}
              searchLabel={RECIPE_PICKER_TEXT.searchLabel}
              inputRef={inputRef}
            />
            {scope.kind === "DAYS" ? (
              <div className="space-y-1.5">
                <ChipGroup
                  type="multiple"
                  label={RECIPE_PICKER_TEXT.daysLabel}
                  options={DAY_OPTIONS}
                  value={markedDays}
                  lockedValues={[scope.focusDay]}
                  onChange={(v) => setMarkedDays(WEEKDAYS.filter((d) => v.includes(d)))}
                />
                <p className="text-footnote text-muted-foreground sm:pl-[6.75rem]">{pickerDaysHint(scope.focusDay)}</p>
              </div>
            ) : null}
            {body}
          </div>
        ) : null}

        {meal && scope ? (
          <RecipePreviewDialog
            card={detailCard}
            onClose={() => setDetailCard(null)}
            renderFooter={(card) => (
              <PickerCard
                card={card}
                kind={kind}
                ownerId={ownerId}
                meals={meals}
                meal={meal}
                scope={scope}
                impactCtx={impactCtx}
                target={target}
                variant="dialog"
              />
            )}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Pie conectado de una tarjeta (o del detalle, `variant="dialog"`): impacto, agregar, porciones y
 * quitar. En el detalle el botón dice el destino ("Agregar a Desayuno · Martes") salvo con varios días.
 */
function PickerCard({
  card,
  kind,
  ownerId,
  meals,
  meal,
  scope,
  impactCtx,
  target,
  variant = "card",
}: {
  card: RecipeCardView;
  kind: MealOwnerKind;
  ownerId: string;
  meals: MealView[];
  meal: MealView;
  scope: PickerScope;
  impactCtx: RecipeImpactContext | null;
  target: PlanTargetView | null;
  variant?: "card" | "dialog";
}) {
  const { add, remove } = useRecipeItemActions(kind, ownerId);
  // Transiciones: el botón sigue "pendiente" hasta que llega la comida revalidada (sin parpadeo).
  const [pending, startAdd] = useTransition();
  const [removing, startRemove] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const items = recipeItemsOf(meal);
  // "Agregada" sale de la comida que llegó con la revalidación, no de un estado local: el último ítem
  // de esa receta en el día que se edita (o en la comida, si es de todos los días).
  const addedItem =
    [...items]
      .reverse()
      .find((i) => i.recipeId === card.id && (scope.kind !== "DAYS" || i.weekday === scope.focusDay)) ?? null;
  const days = scope.kind === "DAYS" ? scope.days : WEEKDAYS;
  const daysToAdd = daysMissingRecipe({ mode: meal.mode, items }, card.id, days);

  // HU-018c-2 (revisión de 018c-1): el impacto mide los mismos días que el botón (`daysToAdd`). Si
  // algún día marcado ya tiene la receta, se recalcula solo para esta tarjeta (caso raro, D5).
  const cardScope = scopeForDaysToAdd(scope, daysToAdd);
  const cardCtx =
    cardScope === scope || !impactCtx
      ? impactCtx
      : prepareRecipeImpact({ meals, mealId: meal.id, scope: cardScope, target });
  const impact = cardCtx && card.perPortion ? computeRecipeImpact(cardCtx, card.perPortion) : null;
  const impactView: PickerCardImpactView | null = impact
    ? { ...formatRecipeImpact(impact, cardScope), fits: impact.fit.kind === "FITS" }
    : null;
  const addCount = scope.kind === "DAYS" ? daysToAdd.length : 1;
  const addLabel = variant === "dialog" && addCount <= 1 ? pickerTitle(meal.name, scope) : addButtonLabel(addCount);

  function onAdd() {
    if (pending) return;
    setError(null);
    const weekdays = scope.kind === "DAYS" ? daysToAdd : null;
    startAdd(async () => {
      const result = await add({
        mealId: meal.id,
        recipeId: card.id,
        weekdays,
        message: recipeAddedMessage(card.name, meal.name, scope, weekdays ?? []),
      });
      if (!result.ok) setError(result.error);
    });
  }

  function onRemove() {
    if (!addedItem || removing) return;
    const itemId = addedItem.id;
    startRemove(async () => {
      await remove([itemId]);
    });
  }

  return (
    <AddedAwareFooter
      key={addedItem?.id ?? "none"}
      kind={kind}
      ownerId={ownerId}
      itemId={addedItem?.id ?? null}
      portions={addedItem?.portions ?? 1}
      recipeName={card.name}
      impact={impactView}
      addLabel={addLabel}
      // En el detalle el botón ya dice el destino: el nombre accesible empieza con el texto visible
      // (WCAG 2.5.3, control por voz) y suma la receta.
      addAriaLabel={variant === "dialog" ? `${addLabel}: ${card.name}` : addAriaLabel(card.name, meal.name, scope)}
      pending={pending}
      error={error}
      onAdd={onAdd}
      onRemove={onRemove}
      removing={removing}
    />
  );
}

/** Separa el hook de porciones optimistas (necesita el id del ítem agregado). */
function AddedAwareFooter({
  kind,
  ownerId,
  itemId,
  portions,
  ...rest
}: Omit<Parameters<typeof PickerCardFooter>[0], "added" | "onPortionsChange"> & {
  kind: MealOwnerKind;
  ownerId: string;
  itemId: string | null;
  portions: number;
}) {
  const optimistic = useRecipePortions(kind, ownerId, itemId ?? "", portions);
  return (
    <PickerCardFooter
      {...rest}
      added={itemId ? { portions: optimistic.portions } : null}
      onPortionsChange={optimistic.change}
    />
  );
}
