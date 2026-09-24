"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Textarea } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
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
  useActionToast(state, { success: "Ficha clínica guardada" });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="patientId" value={patientId} />
      <Field label="Antecedentes" hint="Patologías, alergias, medicación, cirugías previas…">
        <Textarea name="background" rows={4} defaultValue={record?.background ?? ""} />
      </Field>
      {/* Checkbox nativo: mismo name/value en el FormData que antes. */}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="riskFlag"
          value="true"
          defaultChecked={record?.riskFlag ?? false}
          className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
        />
        <span>
          Marcar como antecedente de riesgo (alergia o enfermedad a tener en cuenta al armar el
          plan)
        </span>
      </label>
      <Field label="Objetivos" hint="Qué busca lograr el paciente con el tratamiento.">
        <Textarea name="goals" rows={3} defaultValue={record?.goals ?? ""} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {pending ? "Guardando…" : "Guardar ficha clínica"}
        </Button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}
