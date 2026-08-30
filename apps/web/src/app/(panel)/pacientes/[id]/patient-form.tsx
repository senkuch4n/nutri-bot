"use client";

import { useActionState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { updatePatientAction, type PatientState } from "../actions";

const initial: PatientState = { ok: false };

export function PatientForm({
  patient,
}: {
  patient: { id: string; name: string | null; notes: string | null };
}) {
  const [state, action, pending] = useActionState(updatePatientAction, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={patient.id} />
      <Field label="Nombre">
        <Input name="name" defaultValue={patient.name ?? ""} />
      </Field>
      <Field label="Notas">
        <Textarea name="notes" rows={4} defaultValue={patient.notes ?? ""} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        {state.error ? (
          <span className="reveal text-sm text-red-600">{state.error}</span>
        ) : null}
        {state.ok ? (
          <span className="reveal text-sm font-medium text-leaf-deep">✓ Guardado</span>
        ) : null}
      </div>
    </form>
  );
}
