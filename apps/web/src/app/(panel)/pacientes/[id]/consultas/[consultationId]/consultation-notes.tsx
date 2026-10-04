"use client";

import { useActionState, useState } from "react";
import { CONSULTATION_NOTES_MAX } from "@nutri-bot/core";
import { Button, Card, FormError, Textarea } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
import type { ActionState } from "../../clinical-actions";
import { saveConsultationNotesAction } from "../../consultation-actions";

const initial: ActionState = { ok: false };
const timeFormat = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

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
  // "Guardado a las 10:42" bajo el botón (HU-017c-3): hora local del guardado, solo en el cliente.
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state.ok) setSavedAt(timeFormat.format(new Date()));
  }

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
        <Button type="submit" variant="secondary" size="lg" loading={pending} className="w-full">
          {pending ? "Guardando…" : "Guardar notas"}
        </Button>
        {savedAt && !pending ? (
          <p className="text-center text-footnote tabular-nums text-muted-foreground" aria-live="polite">
            Guardado a las {savedAt}
          </p>
        ) : null}
        <FormError message={state.error} />
      </form>
    </Card>
  );
}
