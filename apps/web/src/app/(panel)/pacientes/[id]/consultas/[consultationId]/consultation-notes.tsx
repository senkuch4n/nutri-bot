"use client";

import { useActionState } from "react";
import { CONSULTATION_NOTES_MAX } from "@nutri-bot/core";
import { Button, Card, FormError, Textarea } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
import type { ActionState } from "../../clinical-actions";
import { saveConsultationNotesAction } from "../../consultation-actions";

const initial: ActionState = { ok: false };

/** Notas libres de la consulta. Guardar vacío las borra. */
export function ConsultationNotes({
  patientId,
  consultationId,
  notes,
}: {
  patientId: string;
  consultationId: string;
  notes: string | null;
}) {
  const [state, action, pending] = useActionState(saveConsultationNotesAction, initial);
  useActionToast(state, { success: "Notas guardadas" });

  return (
    <Card title="Notas">
      <form action={action} className="space-y-3">
        <input type="hidden" name="patientId" value={patientId} />
        <input type="hidden" name="consultationId" value={consultationId} />
        <label className="sr-only" htmlFor={`notes-${consultationId}`}>
          Notas de la consulta
        </label>
        <Textarea
          id={`notes-${consultationId}`}
          name="notes"
          rows={6}
          maxLength={CONSULTATION_NOTES_MAX}
          defaultValue={notes ?? ""}
          placeholder="Observaciones, indicaciones, próximos pasos…"
        />
        <Button type="submit" variant="secondary" loading={pending} className="w-full">
          {pending ? "Guardando…" : "Guardar notas"}
        </Button>
        <FormError message={state.error} />
      </form>
    </Card>
  );
}
