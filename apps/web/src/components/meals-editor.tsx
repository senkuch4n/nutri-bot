import { Button, Card, Input, Select, Textarea } from "@/components/ui";
import { FOOD_GROUP_LABELS, FOOD_GROUPS } from "@/lib/food-groups";

export interface FoodOption {
  id: string;
  name: string;
  group: string;
}

export interface MealItemView {
  id: string;
  foodId: string | null;
  foodName: string | null;
  customLabel: string | null;
  quantityGrams: string | null;
  notes: string | null;
  macros: { kcal: number; protein: number; carbs: number; fat: number; fiber: number } | null;
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
  const foodsByGroup = FOOD_GROUPS.map((g) => ({
    group: g,
    label: FOOD_GROUP_LABELS[g as keyof typeof FOOD_GROUP_LABELS],
    foods: foods.filter((f) => f.group === g),
  })).filter((g) => g.foods.length > 0);

  return (
    <div className="space-y-4">
      {meals.length === 0 ? (
        <p className="text-sm text-ink-faint">Todavía no hay comidas cargadas.</p>
      ) : null}

      {meals.map((meal) => (
        <Card key={meal.id}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="font-display text-lg font-bold text-ink">{meal.name}</h3>
            <form action={deleteMealAction}>
              <input type="hidden" name="mealId" value={meal.id} />
              <input type="hidden" name={ownerField} value={ownerId} />
              <button
                type="submit"
                className="text-xs font-semibold text-ink-faint transition-colors hover:text-red-600"
              >
                Borrar comida
              </button>
            </form>
          </div>

          {meal.items.length > 0 ? (
            <ul className="mb-4 divide-y divide-line border border-line">
              {meal.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-4 px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {item.foodName ?? item.customLabel ?? "(sin descripción)"}
                      {item.quantityGrams ? (
                        <span className="ml-2 font-normal text-ink-soft">{item.quantityGrams} g</span>
                      ) : null}
                    </p>
                    {item.notes ? <p className="text-xs text-ink-faint">{item.notes}</p> : null}
                    {showMacros && item.macros ? (
                      <p className="mt-0.5 text-xs text-ink-faint">
                        {item.macros.kcal} kcal · P {item.macros.protein}g · C {item.macros.carbs}g · G{" "}
                        {item.macros.fat}g · Fibra {item.macros.fiber}g
                      </p>
                    ) : null}
                  </div>
                  <form action={deleteItemAction}>
                    <input type="hidden" name="itemId" value={item.id} />
                    <input type="hidden" name={ownerField} value={ownerId} />
                    <button
                      type="submit"
                      className="shrink-0 text-xs font-semibold text-ink-faint transition-colors hover:text-red-600"
                    >
                      Borrar
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}

          <form
            action={addItemAction}
            className="grid gap-3 border-t border-dashed border-line pt-4 sm:grid-cols-[1fr_auto_1fr_auto]"
          >
            <input type="hidden" name="mealId" value={meal.id} />
            <input type="hidden" name={ownerField} value={ownerId} />
            <Select name="foodId" defaultValue="" className="text-sm">
              <option value="">— Alimento libre / sin macros —</option>
              {foodsByGroup.map((g) => (
                <optgroup key={g.group} label={g.label}>
                  {g.foods.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
            <Input type="number" name="quantityGrams" placeholder="Gramos" min="0" step="1" className="w-28" />
            <Input name="customLabel" placeholder="Descripción libre (si no elegiste alimento)" />
            <Button type="submit" size="sm">
              Agregar
            </Button>
            <Textarea
              name="notes"
              rows={1}
              placeholder="Nota (opcional)"
              className="sm:col-span-4"
            />
          </form>
        </Card>
      ))}

      <form action={addMealAction} className="flex items-center gap-3">
        <input type="hidden" name={ownerField} value={ownerId} />
        <Input name="name" placeholder="Nombre de la comida (ej: Desayuno)" required className="max-w-xs" />
        <Button type="submit" variant="secondary" size="sm">
          Agregar comida
        </Button>
      </form>
    </div>
  );
}
