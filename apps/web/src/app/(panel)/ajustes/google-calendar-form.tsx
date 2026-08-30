"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { saveGoogleCalendarIdAction, type SettingsState } from "./actions";

const initial: SettingsState = { ok: false };

export function GoogleCalendarForm({ defaultId }: { defaultId: string }) {
  const [state, action, pending] = useActionState(saveGoogleCalendarIdAction, initial);

  return (
    <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
      <div className="min-w-[220px] flex-1">
        <Field label="Calendario donde se cargan los turnos" hint="'primary' o el ID de otro calendario tuyo">
          <Input name="calendarId" defaultValue={defaultId} placeholder="primary" />
        </Field>
      </div>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
      {state.error ? <span className="reveal text-sm text-red-600">{state.error}</span> : null}
      {state.ok ? (
        <span className="reveal text-sm font-medium text-leaf-deep">✓ Guardado</span>
      ) : null}
    </form>
  );
}
