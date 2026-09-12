"use client";

import { useActionState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { FOOD_GROUP_LABELS, FOOD_GROUPS } from "@/lib/food-groups";
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

  return (
    <form action={formAction} className="space-y-4">
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

      <div className="grid gap-4 sm:grid-cols-5">
        <Field label="Kcal /100g">
          <Input
            type="number"
            step="0.1"
            min="0"
            name="kcalPer100"
            defaultValue={defaults.kcalPer100}
            required
          />
        </Field>
        <Field label="Proteínas /100g">
          <Input
            type="number"
            step="0.1"
            min="0"
            name="proteinPer100"
            defaultValue={defaults.proteinPer100}
            required
          />
        </Field>
        <Field label="Carbohidratos /100g">
          <Input
            type="number"
            step="0.1"
            min="0"
            name="carbsPer100"
            defaultValue={defaults.carbsPer100}
            required
          />
        </Field>
        <Field label="Grasas /100g">
          <Input
            type="number"
            step="0.1"
            min="0"
            name="fatPer100"
            defaultValue={defaults.fatPer100}
            required
          />
        </Field>
        <Field label="Fibra /100g" hint="Opcional">
          <Input
            type="number"
            step="0.1"
            min="0"
            name="fiberPer100"
            defaultValue={defaults.fiberPer100}
          />
        </Field>
      </div>

      <Field label="Equivalencia (opcional)" hint='Ej: "1 huevo mediano ≈ 50 g". Solo informativo.'>
        <Input name="unitHint" defaultValue={defaults.unitHint} />
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </Button>
        {state.error ? <span className="reveal text-sm text-red-600">{state.error}</span> : null}
        {state.ok ? (
          <span className="reveal text-sm font-medium text-leaf-deep">✓ Guardado</span>
        ) : null}
      </div>
    </form>
  );
}
