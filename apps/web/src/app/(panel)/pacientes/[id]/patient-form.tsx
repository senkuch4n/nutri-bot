"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Input, Textarea } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
import { updatePatientAction, type PatientState } from "../actions";

const initial: PatientState = { ok: false };

export function PatientForm({
  patient,
}: {
  patient: { id: string; name: string | null; notes: string | null; birthDateISO: string | null };
}) {
  const [state, action, pending] = useActionState(updatePatientAction, initial);
  useActionToast(state, { success: "Datos del paciente guardados" });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={patient.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre">
          <Input name="name" defaultValue={patient.name ?? ""} />
        </Field>
        <Field label="Fecha de nacimiento" hint="Para calcular la edad en los planes.">
          <Input type="date" name="birthDate" defaultValue={patient.birthDateISO ?? ""} />
        </Field>
      </div>
      <Field label="Notas">
        <Textarea name="notes" rows={4} defaultValue={patient.notes ?? ""} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}
