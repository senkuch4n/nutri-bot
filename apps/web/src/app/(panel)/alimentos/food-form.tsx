"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Input, Select } from "@/components/ui";
import { NumberInput } from "@/components/number-input";
import { FOOD_GROUP_LABELS, FOOD_GROUPS } from "@/lib/food-groups";
import { useActionToast } from "@/lib/notify";
import type { FoodState } from "./actions";

const initial: FoodState = { ok: false };

export interface FoodDefaults {
  name: string;
  group: string;
  kcalPer100: string;
  proteinPer100: string;
  carbsPer100: string;
  fatPer100: string;
  fiberPer100: string;
  unitHint: string;
}

export function FoodForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (prev: FoodState, formData: FormData) => Promise<FoodState>;
  defaults: FoodDefaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  useActionToast(state, { success: "Alimento guardado" });

  return (
    <form action={formAction} className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre">
          <Input name="name" defaultValue={defaults.name} required />
        </Field>
        <Field label="Grupo">
          <Select name="group" defaultValue={defaults.group} required>
            {FOOD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {FOOD_GROUP_LABELS[g]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset>
        <legend className="mb-4 text-sm font-semibold">Composición cada 100 g</legend>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Field label="Energía">
            <NumberInput
              unit="kcal"
              step="0.1"
              min="0"
              name="kcalPer100"
              defaultValue={defaults.kcalPer100}
              required
            />
          </Field>
          <Field label="Proteínas">
            <NumberInput
              unit="g"
              step="0.1"
              min="0"
              name="proteinPer100"
              defaultValue={defaults.proteinPer100}
              required
            />
          </Field>
          <Field label="Carbohidratos">
            <NumberInput
              unit="g"
              step="0.1"
              min="0"
              name="carbsPer100"
              defaultValue={defaults.carbsPer100}
              required
            />
          </Field>
          <Field label="Grasas">
            <NumberInput
              unit="g"
              step="0.1"
              min="0"
              name="fatPer100"
              defaultValue={defaults.fatPer100}
              required
            />
          </Field>
          <Field label="Fibra" hint="Opcional">
            <NumberInput
              unit="g"
              step="0.1"
              min="0"
              name="fiberPer100"
              defaultValue={defaults.fiberPer100}
            />
          </Field>
        </div>
      </fieldset>

      <Field label="Equivalencia" hint='Opcional. Ej: "1 huevo mediano ≈ 50 g". Solo informativo.'>
        <Input name="unitHint" defaultValue={defaults.unitHint} />
      </Field>

      <div className="space-y-3 border-t pt-6">
        <div className="flex items-center gap-3">
          <Button type="submit" loading={pending}>
            {pending ? "Guardando…" : submitLabel}
          </Button>
        </div>
        <FormError message={state.error} />
      </div>
    </form>
  );
}
