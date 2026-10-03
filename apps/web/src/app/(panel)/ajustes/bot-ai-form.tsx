"use client";

import { startTransition, useActionState, useState } from "react";
import { BOT_AI_INFO_MAX } from "@nutri-bot/core";
import { Label } from "@/components/primitives/label";
import { Switch } from "@/components/primitives/switch";
import { Alert, Button, Field, FormError, Textarea } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { saveBotAiAction, type SettingsState } from "./actions";

const initial: SettingsState = { ok: false };
const numberFormat = new Intl.NumberFormat("es-AR");

/**
 * HU-012 (D10, D11): preguntas con IA del bot (opción 5) e "Información para el asistente".
 * Form propio, mismo patrón que AfterHoursForm.
 */
export function BotAiForm({
  defaults,
  keyStatus,
}: {
  defaults: { enabled: boolean; info: string };
  keyStatus: { hasKey: boolean; apiKeyEnvName: string };
}) {
  const [state, action, pending] = useActionState(saveBotAiAction, initial);
  useActionToast(state, { success: "Guardado" });
  const [enabled, setEnabled] = useState(defaults.enabled);
  const [length, setLength] = useState(defaults.info.trim().length);
  const tooLong = length > BOT_AI_INFO_MAX;

  // Se despacha a mano (no `<form action>`) para que React 19 no resetee el form después de
  // enviar: con un error, el texto tiene que quedar en el textarea.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => action(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-sm font-medium">Preguntas con IA</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Suma la opción <em>5. Hacer una pregunta</em> al menú del bot. Un asistente con inteligencia
          artificial responde dudas sobre servicios, precios, turnos y pagos con tus datos cargados. No da
          indicaciones de salud ni de alimentación.
        </p>
      </div>

      {!keyStatus.hasKey ? (
        <Alert tone="warning">
          Falta configurar la clave de la IA en el servidor (<code translate="no">{keyStatus.apiKeyEnvName}</code>). Hasta que
          esté cargada, la opción 5 no aparece en el bot.
        </Alert>
      ) : null}

      <div className="flex items-start justify-between gap-6">
        <div>
          <Label htmlFor="bot-ai-activo" className="text-sm font-medium">
            Responder preguntas con IA
          </Label>
          <p id="bot-ai-activo-desc" className="mt-1 text-sm text-muted-foreground">
            {enabled ? "Los pacientes ven la opción 5 en el menú del bot." : "La opción 5 no aparece en el menú."}
          </p>
        </div>
        <Switch
          id="bot-ai-activo"
          checked={enabled}
          onCheckedChange={setEnabled}
          disabled={!keyStatus.hasKey && !enabled}
          aria-describedby="bot-ai-activo-desc"
        />
        <input type="hidden" name="botAiEnabled" value={enabled ? "1" : "0"} />
      </div>

      <div>
        <Field label="Información para el asistente">
          <Textarea
            name="botAiInfo"
            rows={6}
            defaultValue={defaults.info}
            autoComplete="off"
            aria-describedby="bot-ai-info-help bot-ai-info-count"
            aria-invalid={tooLong || undefined}
            placeholder="Ej.: Atiendo en Av. Siempre Viva 123, consultorio 4. Acepto efectivo, transferencia, débito y crédito en 1 cuota con 10% de recargo. Para cancelar, avisá con 24 h de anticipación."
            onChange={(e) => setLength(e.currentTarget.value.trim().length)}
          />
        </Field>
        <div className="mt-1 flex items-start justify-between gap-4">
          <p id="bot-ai-info-help" className="text-xs text-muted-foreground">
            Lo que escribas acá lo usa el asistente para responder: dirección, medios de pago, cuotas, política
            de cancelación. No pongas datos de pacientes.
          </p>
          <p
            id="bot-ai-info-count"
            aria-live="polite"
            className={cn(
              "shrink-0 text-xs tabular-nums",
              tooLong ? "font-medium text-destructive" : "text-muted-foreground",
            )}
          >
            {numberFormat.format(length)} / {numberFormat.format(BOT_AI_INFO_MAX)}
          </p>
        </div>
      </div>

      <FormError message={state.error} />

      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
