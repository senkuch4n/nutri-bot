"use client";

import { useActionState } from "react";
import {
  ACTIVITY_LEVELS,
  BODY_FRAMES,
  NUTRITION_GOALS,
  SEX_OPTIONS,
  formatDecimalEs,
  type ActivityLevel,
  type BodyFrame,
  type NutritionGoal,
  type Sex,
} from "@nutri-bot/core";
import { Button, Field, Select } from "@/components/ui";
import { updateFormulaDataAction, type PatientState } from "../actions";

const initial: PatientState = { ok: false };

export interface FormulaDataValues {
  sex: Sex | null;
  activityLevel: ActivityLevel | null;
  nutritionGoal: NutritionGoal | null;
  bodyFrame: BodyFrame | null;
}

export function FormulaDataForm({
  patientId,
  values,
}: {
  patientId: string;
  values: FormulaDataValues;
}) {
  const [state, action, pending] = useActionState(updateFormulaDataAction, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={patientId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Sexo (para fórmulas)"
          hint="Sexo biológico, lo usan las fórmulas de TMB y peso ideal."
        >
          <Select name="sex" defaultValue={values.sex ?? ""}>
            <option value="">Sin cargar</option>
            {SEX_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Actividad física">
          <Select name="activityLevel" defaultValue={values.activityLevel ?? ""}>
            <option value="">Sin cargar</option>
            {ACTIVITY_LEVELS.map((o) => (
              <option key={o.value} value={o.value}>
                {`${o.label} (×${formatDecimalEs(o.factor)}) — ${o.description}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Objetivo">
          <Select name="nutritionGoal" defaultValue={values.nutritionGoal ?? ""}>
            <option value="">Sin cargar</option>
            {NUTRITION_GOALS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Contextura"
          hint="Ajusta el peso ideal de Hamwi. Si no se carga, se asume Mediana."
        >
          <Select name="bodyFrame" defaultValue={values.bodyFrame ?? ""}>
            <option value="">Sin cargar</option>
            {BODY_FRAMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        <span role="status" aria-live="polite" className="text-sm">
          {state.error ? <span className="reveal text-red-600">{state.error}</span> : null}
          {state.ok ? <span className="reveal font-medium text-leaf-deep">✓ Guardado</span> : null}
        </span>
      </div>
    </form>
  );
}
