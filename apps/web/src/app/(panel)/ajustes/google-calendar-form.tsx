"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Input } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
import { saveGoogleCalendarIdAction, type SettingsState } from "./actions";

const initial: SettingsState = { ok: false };

export function GoogleCalendarForm({ defaultId }: { defaultId: string }) {
  const [state, action, pending] = useActionState(saveGoogleCalendarIdAction, initial);
  useActionToast(state, { success: "Calendario guardado" });

  return (
    <form action={action} className="mt-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <Field label="Calendario donde se cargan los turnos" hint="'primary' o el ID de otro calendario tuyo">
            <Input name="calendarId" defaultValue={defaultId} placeholder="primary" />
          </Field>
        </div>
        <Button type="submit" variant="secondary" size="sm" loading={pending} className="mb-5">
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}
