"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Input } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
import { addEvolutionEntryAction, type ActionState } from "./clinical-actions";
import { MeasurementFields } from "./measurement-fields";

const initial: ActionState = { ok: false };

/**
 * Alta de una medición. Mismos 18 `name`. La fecha es el día local de la profesional (`todayKey`,
 * calculado en el server) y no puede ser futura: la medición cae en la consulta de ese día (HU-003).
 */
export function EvolutionForm({ patientId, todayKey }: { patientId: string; todayKey: string }) {
  const [state, action, pending] = useActionState(addEvolutionEntryAction, initial);

  useActionToast(state, { success: state.message ?? "Medición agregada" });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="patientId" value={patientId} />
      <MeasurementFields
        leading={
          <Field label="Fecha">
            <Input type="date" name="recordedAt" defaultValue={todayKey} max={todayKey} required />
          </Field>
        }
        submit={
          <Button type="submit" loading={pending}>
            {pending ? "Agregando…" : "Agregar"}
          </Button>
        }
      />
      <FormError message={state.error} />
    </form>
  );
}
