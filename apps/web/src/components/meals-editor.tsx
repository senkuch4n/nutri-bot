import { Plus, UtensilsCrossed } from "lucide-react";
import { formatMacroAmount, formatMacrosLine, type AtwaterBreakdown } from "@nutri-bot/core";
import { Card, EmptyState, Field, Input, Quantity, Textarea } from "@/components/ui";
import { DeleteMealButton } from "@/components/delete-meal-button";
import { NumberInput } from "@/components/number-input";
import { SubmitButton } from "@/components/submit-button";
import { FoodCatalogProvider, type FoodOption } from "@/components/food-catalog";
import { FoodPicker } from "@/components/food-picker";
import { KcalBreakdownPopover } from "@/components/kcal-breakdown-popover";

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
}

export interface MealView {
  id: string;
  name: string;
  items: MealItemView[];
}

export interface MealsEditorProps {
  ownerId: string;
  ownerField: "planId" | "templateId";
  meals: MealView[];
  foods: FoodOption[];
  addMealAction: (formData: FormData) => Promise<void>;
  deleteMealAction: (formData: FormData) => Promise<void>;
  addItemAction: (formData: FormData) => Promise<void>;
  deleteItemAction: (formData: FormData) => Promise<void>;
  showMacros?: boolean;
}

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
}: MealsEditorProps) {
  return (
    <FoodCatalogProvider foods={foods}>
      <div className="space-y-6">
        {meals.length === 0 ? (
          <Card>
            <EmptyState
              icon={UtensilsCrossed}
              title="Todavía no hay comidas"
              description="Agregá la primera (por ejemplo, Desayuno) con el formulario de abajo."
            />
          </Card>
        ) : null}

        {meals.map((meal) => (
          <Card
            key={meal.id}
            title={meal.name}
            description={
              meal.items.length === 0
                ? "Sin alimentos todavía"
                : `${meal.items.length} alimento${meal.items.length === 1 ? "" : "s"}`
            }
            actions={
              <DeleteMealButton
                mealId={meal.id}
                mealName={meal.name}
                itemCount={meal.items.length}
                ownerField={ownerField}
                ownerId={ownerId}
                deleteMealAction={deleteMealAction}
              />
            }
          >
            {meal.items.length > 0 ? (
              <ul className="divide-y rounded-md border">
                {meal.items.map((item) => {
                  const itemName = item.foodName ?? item.customLabel ?? "(sin descripción)";
                  return (
                    <li key={item.id} className="flex items-start justify-between gap-4 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium">{itemName}</p>
                        {item.notes ? <p className="mt-0.5 text-xs text-muted-foreground">{item.notes}</p> : null}
                        {showMacros && item.macros ? (
                          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                            {item.kcalBreakdown ? (
                              <>
                                <KcalBreakdownPopover
                                  kcal={item.macros.kcal}
                                  breakdown={item.kcalBreakdown}
                                  itemName={itemName}
                                />
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
                            aria-label={`Quitar ${itemName} de ${meal.name}`}
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

            <form action={addItemAction} className="mt-6 space-y-4 border-t pt-6">
              <h3 className="text-sm font-semibold">Agregar alimento</h3>
              <input type="hidden" name="mealId" value={meal.id} />
              <input type="hidden" name={ownerField} value={ownerId} />
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
                <Field label="Alimento">
                  <FoodPicker name="foodId" />
                </Field>
                <Field label="Cantidad">
                  <NumberInput unit="g" name="quantityGrams" min="0" step="1" />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Descripción libre" hint="Solo si no elegiste un alimento.">
                  <Input name="customLabel" />
                </Field>
                <Field label="Nota" hint="Opcional">
                  <Textarea name="notes" rows={1} className="min-h-9" />
                </Field>
              </div>
              <SubmitButton variant="secondary" size="sm" pendingLabel="Agregando…">
                <Plus aria-hidden />
                Agregar
              </SubmitButton>
            </form>
          </Card>
        ))}

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
      </div>
    </FoodCatalogProvider>
  );
}
