"use client";

import { useActionState } from "react";
import { Button, Field, Textarea } from "@/components/ui";
import { updateClinicalRecordAction, type ActionState } from "./clinical-actions";

const initial: ActionState = { ok: false };

export function ClinicalRecordForm({
  patientId,
  record,
}: {
  patientId: string;
  record: { background: string | null; goals: string | null; riskFlag: boolean } | null;
}) {
  const [state, action, pending] = useActionState(updateClinicalRecordAction, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="patientId" value={patientId} />
      <Field label="Antecedentes" hint="Patologías, alergias, medicación, cirugías previas…">
        <Textarea name="background" rows={4} defaultValue={record?.background ?? ""} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="riskFlag"
          value="true"
          defaultChecked={record?.riskFlag ?? false}
          className="h-4 w-4 accent-leaf"
        />
        Marcar como antecedente de riesgo (alergia o enfermedad a tener en cuenta al armar el plan)
      </label>
      <Field label="Objetivos" hint="Qué busca lograr el paciente con el tratamiento.">
        <Textarea name="goals" rows={3} defaultValue={record?.goals ?? ""} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar ficha clínica"}
        </Button>
        {state.error ? <span className="reveal text-sm text-red-600">{state.error}</span> : null}
        {state.ok ? (
          <span className="reveal text-sm font-medium text-leaf-deep">✓ Guardado</span>
        ) : null}
      </div>
    </form>
  );
}
