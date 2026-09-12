"use client";

import { useActionState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
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
    acceptedInsurances: string;
    pdfAccentColor: string;
    pdfFooterText: string;
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

      <div className="sm:col-span-2">
        <Field
          label="Obras sociales"
          hint='Una por línea o separadas por coma — el bot las muestra como lista al mostrar precios. Ej: "OSDE, Swiss Medical, Galeno, Particular"'
        >
          <Textarea name="acceptedInsurances" rows={2} defaultValue={defaults.acceptedInsurances} />
        </Field>
      </div>

      <Field label="Color de acento del PDF" hint="Se usa en los títulos y separadores del PDF del plan">
        <input
          type="color"
          name="pdfAccentColor"
          defaultValue={defaults.pdfAccentColor || "#3c7a24"}
          className="h-10 w-20 cursor-pointer border border-line bg-paper p-1"
        />
      </Field>

      <div className="sm:col-span-2">
        <Field
          label="Pie de página del PDF"
          hint='Reemplaza el texto default ("Generado el ... · NutriBot"). Ej: "Lic. en Nutrición · Mat. 1234 · +54 9 11 XXXX-XXXX"'
        >
          <Textarea name="pdfFooterText" rows={2} defaultValue={defaults.pdfFooterText} />
        </Field>
      </div>

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
