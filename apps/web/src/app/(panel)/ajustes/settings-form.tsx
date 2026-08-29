"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { saveSettingsAction, type SettingsState } from "./actions";

const initial: SettingsState = { ok: false };

export function SettingsForm({
  defaults,
}: {
  defaults: {
    timezone: string;
    currency: string;
    reminderLeadHours: number;
    googleCalendarId: string;
    phoneJid: string;
  };
}) {
  const [state, action, pending] = useActionState(saveSettingsAction, initial);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Zona horaria" hint="Formato IANA, ej: America/Argentina/Buenos_Aires">
        <Input name="timezone" defaultValue={defaults.timezone} required />
      </Field>
      <Field label="Moneda" hint="Código ISO de 3 letras, ej: ARS">
        <Input name="currency" defaultValue={defaults.currency} maxLength={3} required />
      </Field>
      <Field label="Aviso previo (horas)" hint="Cuántas horas antes se envía el recordatorio">
        <Input
          name="reminderLeadHours"
          type="number"
          min={1}
          max={168}
          defaultValue={defaults.reminderLeadHours}
          required
        />
      </Field>
      <Field label="WhatsApp de la profesional (JID)" hint="Para alertas. Ej: 549XXXXXXXXXX@s.whatsapp.net">
        <Input name="phoneJid" defaultValue={defaults.phoneJid} placeholder="549...@s.whatsapp.net" />
      </Field>
      <Field label="Google Calendar ID" hint="'primary' o el ID de un calendario específico">
        <Input name="googleCalendarId" defaultValue={defaults.googleCalendarId} placeholder="primary" />
      </Field>

      <div className="sm:col-span-2 flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar ajustes"}
        </Button>
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        {state.ok ? <span className="text-sm text-green-600">Guardado.</span> : null}
      </div>
    </form>
  );
}
