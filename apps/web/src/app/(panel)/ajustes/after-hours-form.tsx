"use client";

import { startTransition, useActionState, useState } from "react";
import { Label } from "@/components/primitives/label";
import { Switch } from "@/components/primitives/switch";
import { Button, Field, FormError, Input } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
import { saveAfterHoursAction, type SettingsState } from "./actions";

const initial: SettingsState = { ok: false };

/**
 * HU-011 (D1): horario de atención de la opción 0. Fuera de él, el bot toma la consulta y la
 * resume al terminar la franja. "Desde las" = fin de la franja; "Hasta las" = inicio.
 * Form propio (no usa SettingsFormProvider).
 */
export function AfterHoursForm({
  defaults,
}: {
  defaults: { enabled: boolean; attendFrom: string; attendTo: string };
}) {
  const [state, action, pending] = useActionState(saveAfterHoursAction, initial);
  useActionToast(state, { success: "Horario de consultas guardado" });
  const [enabled, setEnabled] = useState(defaults.enabled);
  const [attendFrom, setAttendFrom] = useState(defaults.attendFrom);

  // Se despacha a mano (no `<form action>`) para que React 19 no resetee el form después de
  // enviar: con un error de validación, lo tipeado tiene que quedar en los inputs.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => action(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-sm font-medium">Horario de consultas</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Fuera de este horario, cuando un paciente elige <em>Hablar con la nutricionista</em>, el bot le
          toma la consulta y te la deja para la mañana en vez de avisarte en el momento.
        </p>
      </div>

      <div className="flex items-start justify-between gap-6">
        <div>
          <Label htmlFor="after-hours-activo" className="text-sm font-medium">
            Activado
          </Label>
          <p id="after-hours-activo-desc" className="mt-1 text-sm text-muted-foreground">
            {enabled
              ? `El bot toma las consultas fuera de horario y te manda un resumen a las ${attendFrom || "—"}.`
              : "La opción 0 te avisa en el momento, a cualquier hora."}
          </p>
        </div>
        <Switch
          id="after-hours-activo"
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-describedby="after-hours-activo-desc"
        />
        <input type="hidden" name="afterHoursEnabled" value={enabled ? "1" : "0"} />
      </div>

      {/* Los horarios siguen editables con el switch apagado, así no se pierden. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Desde las">
          <Input
            type="time"
            name="attendFrom"
            required
            autoComplete="off"
            defaultValue={defaults.attendFrom}
            onChange={(e) => setAttendFrom(e.currentTarget.value)}
          />
        </Field>
        <Field label="Hasta las">
          <Input type="time" name="attendTo" required autoComplete="off" defaultValue={defaults.attendTo} />
        </Field>
      </div>

      <FormError message={state.error} />

      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        {pending ? "Guardando…" : "Guardar horario"}
      </Button>
    </form>
  );
}
