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
    phone: string;
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
      <Field label="Aviso previo del recordatorio (horas)" hint="Cuántas horas antes del turno se envía el recordatorio">
        <Input
          name="reminderLeadHours"
          type="number"
          min={1}
          max={168}
          defaultValue={defaults.reminderLeadHours}
          required
        />
      </Field>
      <Field
        label="Tu WhatsApp (para las alertas)"
        hint="Con código de país, solo números. El bot te avisa acá cuando un paciente saca o cancela un turno."
      >
        <Input
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={defaults.phone}
          placeholder="549XXXXXXXXXX"
        />
      </Field>

      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar ajustes"}
        </Button>
        {state.error ? <span className="reveal text-sm text-red-600">{state.error}</span> : null}
        {state.ok ? (
          <span className="reveal text-sm font-medium text-leaf-deep">✓ Guardado</span>
        ) : null}
      </div>
    </form>
  );
}
