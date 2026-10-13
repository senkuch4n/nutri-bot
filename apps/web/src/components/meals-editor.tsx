"use client";

import { useEffect, useState } from "react";
import { Copy, Plus, Search, UtensilsCrossed } from "lucide-react";
import {
  WEEKDAY_LABELS,
  computeWeeklyTotals,
  formatMacroAmount,
  formatMacrosLine,
  itemsForDay,
  mealTotalForDay,
  openPickerAriaLabel,
  RECIPE_PICKER_TEXT,
  type AtwaterBreakdown,
  type Macros,
  type MealMode,
  type Weekday,
} from "@nutri-bot/core";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Quantity } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { FoodCatalogProvider, type FoodOption } from "@/components/food-catalog";
import { KcalBreakdownPopover } from "@/components/kcal-breakdown-popover";
import { copyDayAction } from "@/app/(panel)/weekly-menu-actions";
import { CopyDayDialog } from "@/components/weekly-menu/copy-day-dialog";
import { DaySelector, type DaySelection } from "@/components/weekly-menu/day-selector";
import { DayTargetStrip, type PlanTargetView } from "@/components/weekly-menu/day-target-strip";
import { toDayParam } from "@/components/weekly-menu/day-param";
import { copiedDayMessage, itemLabel } from "@/components/weekly-menu/labels";
import { MealCardMenu } from "@/components/weekly-menu/meal-card-menu";
import { useMenuUndo } from "@/components/weekly-menu/use-menu-undo";
import { WeeklyOverview } from "@/components/weekly-menu/weekly-overview";
import type { RecipeItemView } from "@/components/recipe-picker/types";
import type { AddMealItemResult, FoodMeasureView, MeasureItemView } from "@/components/food-measures/types";
import { AddFoodForm } from "@/components/food-measures/add-food-form";
import { MeasureMealItem } from "@/components/food-measures/measure-meal-item";
import { RecipeMealItem } from "@/components/recipe-picker/recipe-meal-item";
import { RecipePickerSheet } from "@/components/recipe-picker/recipe-picker-sheet";

export type { FoodOption } from "@/components/food-catalog";

export interface MealItemView {
  id: string;
  foodId: string | null;
  foodName: string | null;
  customLabel: string | null;
  quantityGrams: string | null;
  notes: string | null;
  macros: { kcal: number; protein: number; carbs: number; fat: number; fiber: number } | null;
  /** Desglose de Atwater de la porción (popover de kcal). null si no hay alimento o cantidad. */
  kcalBreakdown: AtwaterBreakdown | null;
  /** HU-018b: null = todos los días (comida EVERY_DAY). */
  weekday: Weekday | null;
  /** HU-018c: ítem de receta (macros ya multiplicados por las porciones). Opcional: los fixtures de 018b no cambian. */
  recipe?: RecipeItemView | null;
  /** HU-018d: ítem de alimento en medida casera. Opcional: los fixtures de 018b/018c no cambian. */
  measure?: MeasureItemView | null;
}

export interface MealView {
  id: string;
  name: string;
  /** HU-018b: "Igual todos los días" (EVERY_DAY) o "Cambia cada día" (PER_DAY). */
  mode: MealMode;
  /** HU-018b: "Opciones (elige una)". Solo con EVERY_DAY. */
  isOptions: boolean;
  items: MealItemView[];
}

export interface MealsEditorProps {
  ownerId: string;
  ownerField: "planId" | "templateId";
  meals: MealView[];
  foods: FoodOption[];
  addMealAction: (formData: FormData) => Promise<void>;
  deleteMealAction: (formData: FormData) => Promise<void>;
  addItemAction: (formData: FormData) => Promise<AddMealItemResult | void>;
  deleteItemAction: (formData: FormData) => Promise<void>;
  showMacros?: boolean;
  /** HU-018b: dueño de las comidas, para las actions del menú semanal. */
  kind: "plan" | "template";
  /** HU-018b: objetivo del paciente (D7). null en plantillas o sin prescripción. */
  target: PlanTargetView | null;
  /** HU-018b: solo planes sin objetivo, link de "Calculá el requerimiento…". */
  targetMissingHref: string | null;
  /** HU-018b: día con el que abre (lo calcula la página con `?dia=`). */
  initialDay: DaySelection;
  /** HU-018d: medidas caseras de los alimentos SARA 2 activos, por foodId (solo los que tienen). */
  measures?: Record<string, FoodMeasureView[]>;
}

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
const integer = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Editor de comidas de un plan o una plantilla. HU-018b: menú semanal con pestañas por día, vista
 * "Semana", franja del día contra el objetivo y el menú "⋯" de cada comida. Un plan sin comidas
 * "Cambia cada día" (los previos a la HU) se ve como antes: una sola lista, sin pestañas.
 */
export function MealsEditor({
  ownerId,
  ownerField,
  meals,
  foods,
  addMealAction,
  deleteMealAction,
  addItemAction,
  deleteItemAction,
  showMacros = false,
  kind,
  target,
  targetMissingHref,
  initialDay,
  measures,
}: MealsEditorProps) {
  const weekly = computeWeeklyTotals(meals);
  const [selected, setSelected] = useState<DaySelection>(initialDay);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const [copyVariant, setCopyVariant] = useState<"to-others" | "into-day" | null>(null);
  const { pending: copying, run } = useMenuUndo(kind, ownerId);
  // HU-018c: un solo buscador de recetas para todas las comidas. `picker` se conserva al cerrar para
  // que el panel salga con su contenido.
  const [picker, setPicker] = useState<{ mealId: string; day: Weekday | null } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Un plan semanal siempre tiene un día elegido; en uno no semanal el día no aplica.
  const day: Weekday | null = weekly.isWeekly && selected !== "WEEK" ? selected : null;
  const showWeek = weekly.isWeekly && selected === "WEEK";

  // El día vive en la URL (?dia=) para que una recarga o una revalidación lo conserven.
  useEffect(() => {
    if (!weekly.isWeekly) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("dia") === toDayParam(selected)) return;
    url.searchParams.set("dia", toDayParam(selected));
    window.history.replaceState(null, "", url.toString());
  }, [selected, weekly.isWeekly]);

  // Desde la vista Semana: después de cambiar de día, llevar la comida a la vista.
  useEffect(() => {
    if (!scrollTo) return;
    document.getElementById(`meal-${scrollTo}`)?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
    setScrollTo(null);
  }, [scrollTo, selected]);

  const strip = !weekly.isWeekly
    ? { title: "Total del día", totals: weekly.days.MON.macros, average: null }
    : showWeek
      ? { title: "Promedio diario de la semana", totals: weekly.weeklyAverage ?? ZERO, average: null }
      : {
          title: WEEKDAY_LABELS[day!].long,
          totals: weekly.days[day!].macros,
          average: weekly.weeklyAverage?.kcal ?? null,
        };

  const dayLoaded = day ? weekly.loadedDays.includes(day) : false;
  const otherLoadedDays = day ? weekly.loadedDays.filter((d) => d !== day) : [];

  return (
    <FoodCatalogProvider foods={foods} measures={measures}>
      <div className="space-y-6">
        {weekly.isWeekly ? (
          <DaySelector value={selected} onValueChange={setSelected} loadedDays={weekly.loadedDays} />
        ) : null}

        {meals.length > 0 ? (
          <div className="material-bar z-10 -mx-2 rounded-xl px-2 py-3 md:sticky md:top-14 lg:top-0">
            <DayTargetStrip
              title={strip.title}
              totals={strip.totals}
              target={target}
              targetMissingHref={targetMissingHref}
              weeklyAverageKcal={strip.average}
            />
          </div>
        ) : null}

        {meals.length === 0 ? (
          <Card>
            <EmptyState
              icon={UtensilsCrossed}
              title="Todavía no hay comidas"
              description="Agregá la primera (por ejemplo, Desayuno) con el formulario de abajo."
            />
          </Card>
        ) : null}

        {showWeek ? (
          <WeeklyOverview
            meals={meals}
            target={target}
            onSelect={(nextDay, mealId) => {
              setSelected(nextDay);
              setScrollTo(mealId);
            }}
          />
        ) : null}

        {day && dayLoaded ? (
          <Button variant="secondary" size="lg" loading={copying} onClick={() => setCopyVariant("to-others")}>
            {copying ? null : <Copy aria-hidden />}
            Copiar este día a…
          </Button>
        ) : null}

        {day && !dayLoaded ? (
          <Alert tone="info">
            <p>El {WEEKDAY_LABELS[day].lower} todavía no tiene comidas.</p>
            {otherLoadedDays.length > 0 ? (
              <Button
                variant="secondary"
                size="lg"
                className="mt-3"
                loading={copying}
                onClick={() => setCopyVariant("into-day")}
              >
                {copying ? null : <Copy aria-hidden />}
                Copiar otro día acá
              </Button>
            ) : null}
          </Alert>
        ) : null}

        {!showWeek
          ? meals.map((meal, index) => (
              <MealCard
                key={meal.id}
                meal={meal}
                day={day}
                weeklyPlan={weekly.isWeekly}
                isFirst={index === 0}
                isLast={index === meals.length - 1}
                kind={kind}
                ownerId={ownerId}
                ownerField={ownerField}
                addItemAction={addItemAction}
                deleteItemAction={deleteItemAction}
                deleteMealAction={deleteMealAction}
                showMacros={showMacros}
                onAddRecipe={() => {
                  setPicker({ mealId: meal.id, day });
                  setPickerOpen(true);
                }}
                onModeChanged={(mode) => {
                  // Un plan que se vuelve semanal desde la lista abre en el lunes, no en "Semana".
                  if (!weekly.isWeekly && mode === "PER_DAY") setSelected("MON");
                }}
              />
            ))
          : null}

        {!showWeek ? (
          <Card>
            <form action={addMealAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name={ownerField} value={ownerId} />
              <div className="w-full sm:w-72">
                <Field label="Nueva comida">
                  <Input name="name" required placeholder="Ej: Desayuno" />
                </Field>
              </div>
              <SubmitButton variant="secondary" pendingLabel="Agregando…">
                <Plus aria-hidden />
                Agregar comida
              </SubmitButton>
            </form>
          </Card>
        ) : null}

        <RecipePickerSheet
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          kind={kind}
          ownerId={ownerId}
          meals={meals}
          mealId={picker?.mealId ?? null}
          focusDay={picker?.day ?? null}
          target={kind === "plan" ? target : null}
        />

        {day ? (
          <CopyDayDialog
            open={copyVariant !== null}
            onOpenChange={(open) => {
              if (!open) setCopyVariant(null);
            }}
            variant={copyVariant ?? "to-others"}
            day={day}
            loadedDays={weekly.loadedDays}
            onConfirm={(from, to) =>
              run(() => copyDayAction({ kind, ownerId, from, to }), copiedDayMessage(from, to))
            }
          />
        ) : null}
      </div>
    </FoodCatalogProvider>
  );
}

function MealTotal({ meal, day }: { meal: MealView; day: Weekday }) {
  const total = mealTotalForDay(meal, day);
  if (total.itemCount === 0) return null;
  if (meal.isOptions) {
    if (!total.optionsRange) return null;
    return (
      <p className="text-right text-callout font-semibold tabular-nums">
        Opciones: {integer.format(total.optionsRange.minKcal)} a {integer.format(total.optionsRange.maxKcal)} kcal
        <span className="block text-footnote font-normal text-muted-foreground">
          Suma al día el promedio: {integer.format(total.macros.kcal)} kcal
        </span>
      </p>
    );
  }
  return <p className="text-right text-callout font-semibold tabular-nums">{integer.format(total.macros.kcal)} kcal</p>;
}

function MealCard({
  meal,
  day,
  weeklyPlan,
  isFirst,
  isLast,
  kind,
  ownerId,
  ownerField,
  addItemAction,
  deleteItemAction,
  deleteMealAction,
  showMacros,
  onAddRecipe,
  onModeChanged,
}: {
  meal: MealView;
  /** Día de la pestaña (plan semanal) o null (lista de un plan no semanal). */
  day: Weekday | null;
  weeklyPlan: boolean;
  isFirst: boolean;
  isLast: boolean;
  kind: "plan" | "template";
  ownerId: string;
  ownerField: "planId" | "templateId";
  addItemAction: (formData: FormData) => Promise<AddMealItemResult | void>;
  deleteItemAction: (formData: FormData) => Promise<void>;
  deleteMealAction: (formData: FormData) => Promise<void>;
  showMacros: boolean;
  /** HU-018c: abre el buscador de recetas para esta comida (y el día de la pestaña). */
  onAddRecipe: () => void;
  onModeChanged: (mode: MealMode) => void;
}) {
  const perDay = meal.mode === "PER_DAY" && day !== null;
  const items = day ? itemsForDay(meal, day) : meal.items;
  const title = perDay ? `${meal.name} · ${WEEKDAY_LABELS[day!].long}` : meal.name;
  // "" = todos los días. Una comida "Cambia cada día" manda el día de la pestaña (pendiente de 018b-1).
  const weekday = perDay ? day! : "";
  const where = perDay ? `${meal.name} del ${WEEKDAY_LABELS[day!].lower}` : meal.name;
  const recipeAria = openPickerAriaLabel(
    meal.name,
    !weeklyPlan ? { kind: "PLAN" } : perDay ? { kind: "DAYS", focusDay: day!, days: [day!] } : { kind: "EVERY_DAY" },
  );

  return (
    <section id={`meal-${meal.id}`} aria-label={title} className="scroll-mt-6 md:scroll-mt-72 lg:scroll-mt-60">
      <Card>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-headline">{title}</h2>
            {(weeklyPlan && meal.mode === "EVERY_DAY") || meal.isOptions ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {weeklyPlan && meal.mode === "EVERY_DAY" ? <Badge>Todos los días</Badge> : null}
                {meal.isOptions ? <Badge tone="info">Elegí una</Badge> : null}
              </div>
            ) : null}
            {weeklyPlan && meal.mode === "EVERY_DAY" ? (
              <p className="mt-1 text-footnote text-muted-foreground">Los cambios valen para todos los días</p>
            ) : null}
            {items.length === 0 ? (
              <p className="mt-1 text-subheadline text-muted-foreground">Sin alimentos todavía</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-start gap-1">
            {showMacros ? <MealTotal meal={meal} day={day ?? "MON"} /> : null}
            <MealCardMenu
              kind={kind}
              ownerId={ownerId}
              ownerField={ownerField}
              meal={meal}
              day={day}
              isFirst={isFirst}
              isLast={isLast}
              deleteMealAction={deleteMealAction}
              onModeChanged={onModeChanged}
            />
          </div>
        </div>

        {items.length > 0 ? (
          <ul className="divide-y rounded-md border">
            {items.map((item) => {
              if (item.recipe) {
                return (
                  <RecipeMealItem
                    key={item.id}
                    item={item}
                    recipe={item.recipe}
                    kind={kind}
                    ownerId={ownerId}
                    ownerField={ownerField}
                    deleteItemAction={deleteItemAction}
                    showMacros={showMacros}
                    where={where}
                  />
                );
              }
              if (item.measure) {
                return (
                  <MeasureMealItem
                    key={item.id}
                    item={item}
                    measure={item.measure}
                    kind={kind}
                    ownerId={ownerId}
                    ownerField={ownerField}
                    deleteItemAction={deleteItemAction}
                    showMacros={showMacros}
                    where={where}
                  />
                );
              }
              const itemName = itemLabel(item);
              return (
                <li key={item.id} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">{itemName}</p>
                    {item.notes ? <p className="mt-0.5 text-xs text-muted-foreground">{item.notes}</p> : null}
                    {showMacros && item.macros ? (
                      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                        {item.kcalBreakdown ? (
                          <>
                            <KcalBreakdownPopover kcal={item.macros.kcal} breakdown={item.kcalBreakdown} itemName={itemName} />
                            {` · P ${formatMacroAmount(item.macros.protein, "g")} · C ${formatMacroAmount(
                              item.macros.carbs,
                              "g",
                            )} · G ${formatMacroAmount(item.macros.fat, "g")} · Fibra ${formatMacroAmount(
                              item.macros.fiber,
                              "g",
                            )}`}
                          </>
                        ) : (
                          formatMacrosLine(item.macros, { includeFiber: true })
                        )}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {item.quantityGrams ? (
                      <Quantity value={Number(item.quantityGrams)} unit="g" decimals={1} className="text-sm" />
                    ) : null}
                    <form action={deleteItemAction}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name={ownerField} value={ownerId} />
                      <SubmitButton
                        variant="ghost"
                        size="sm"
                        pendingLabel="Quitando…"
                        aria-label={`Quitar ${itemName} de ${where}`}
                      >
                        Quitar
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        {/* key por día: al cambiar de pestaña el formulario empieza vacío (no se arrastra lo tipeado). */}
        {/* HU-018c: "Agregar receta" es la acción principal de la comida; "Agregar alimento" queda abajo. */}
        <div className="mt-6 border-t pt-6">
          <Button size="lg" className="w-full sm:w-auto" aria-label={recipeAria} onClick={onAddRecipe}>
            <Search aria-hidden />
            {RECIPE_PICKER_TEXT.openButton}
          </Button>
        </div>

        {/* HU-018d: el bloque "Agregar alimento" se movió a food-measures/add-food-form.tsx (+ medida casera). */}
        <AddFoodForm
          key={`${meal.id}-${weekday}`}
          mealId={meal.id}
          ownerField={ownerField}
          ownerId={ownerId}
          weekday={weekday}
          submitLabel={perDay ? `Agregar al ${WEEKDAY_LABELS[day!].lower}` : "Agregar"}
          addItemAction={addItemAction}
        />
      </Card>
    </section>
  );
}
