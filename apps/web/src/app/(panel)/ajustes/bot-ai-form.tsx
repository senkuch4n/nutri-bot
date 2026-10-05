"use client";

import { useId } from "react";
import { BOT_AI_INFO_MAX, SETTINGS_TEXT as T } from "@nutri-bot/core";
import { GroupedList } from "@/components/grouped-list";
import { Switch } from "@/components/primitives/switch";
import { Alert, Textarea, cn } from "@/components/ui";
import { DetailDisclosure } from "../pacientes/[id]/detail-disclosure";
import { saveBotAiAction } from "./actions";
import { GroupFooter, SwitchRow, useSettingsForm } from "./settings-ui";

const numberFormat = new Intl.NumberFormat("es-AR");

/**
 * HU-012 (D10, D11): preguntas con IA del bot (opción 5) e "Información para el asistente".
 * HU-017b-4 (D22): sin clave, una frase simple y el nombre de la variable detrás de "Ver detalle técnico".
 */
export function BotAiForm({
  defaults,
  keyStatus,
}: {
  defaults: { enabled: boolean; info: string };
  keyStatus: { hasKey: boolean; apiKeyEnvName: string };
}) {
  const form = useSettingsForm(
    "whatsapp",
    { botAiEnabled: defaults.enabled ? "1" : "0", botAiInfo: defaults.info },
    saveBotAiAction,
  );
  const { values, set } = form;
  const enabled = values.botAiEnabled === "1";
  const length = values.botAiInfo.trim().length;
  const tooLong = length > BOT_AI_INFO_MAX;
  const infoId = useId();
  const helpId = useId();
  const countId = useId();

  return (
    <form onSubmit={form.onSubmit} className="space-y-3">
      {!keyStatus.hasKey ? (
        <Alert tone="info">
          <p>{T.aiUnavailable}</p>
          <DetailDisclosure label={T.technicalDetail}>
            <p className="text-footnote text-muted-foreground">
              <code translate="no">{T.aiKeyDetail(keyStatus.apiKeyEnvName)}</code>
            </p>
          </DetailDisclosure>
        </Alert>
      ) : null}
      <GroupedList
        header={T.aiTitle}
        footer="Un asistente responde dudas sobre servicios, precios, turnos y pagos con tus datos. No da indicaciones de salud ni de alimentación."
      >
        <SwitchRow
          label="Responder preguntas con IA"
          labelFor="bot-ai-activo"
          descriptionId="bot-ai-activo-desc"
          description={enabled ? "Las pacientes ven la opción 5 en el menú del bot." : "La opción 5 no aparece en el menú."}
          control={
            <Switch
              id="bot-ai-activo"
              checked={enabled}
              onCheckedChange={(checked) => set("botAiEnabled", checked ? "1" : "0")}
              disabled={!keyStatus.hasKey && !enabled}
              aria-describedby="bot-ai-activo-desc"
            />
          }
        />
        <li className="relative px-4 py-3">
          <label htmlFor={infoId} className="block text-callout text-foreground">
            Información para el asistente
          </label>
          <Textarea
            id={infoId}
            name="botAiInfo"
            rows={5}
            autoComplete="off"
            className="mt-2"
            aria-describedby={`${helpId} ${countId}`}
            aria-invalid={tooLong || undefined}
            placeholder="Ej.: Atiendo en Av. Siempre Viva 123, consultorio 4. Acepto efectivo, transferencia, débito y crédito en 1 cuota con 10% de recargo. Para cancelar, avisá con 24 h de anticipación."
            value={values.botAiInfo}
            onChange={(e) => set("botAiInfo", e.currentTarget.value)}
          />
          <div className="mt-1.5 flex items-start justify-between gap-4">
            <p id={helpId} className="text-footnote text-muted-foreground">
              Dirección, medios de pago, cuotas, política de cancelación. No pongas datos de pacientes.
            </p>
            <p
              id={countId}
              aria-live="polite"
              className={cn("shrink-0 text-footnote tabular-nums", tooLong ? "font-medium text-destructive" : "text-muted-foreground")}
            >
              {numberFormat.format(length)} / {numberFormat.format(BOT_AI_INFO_MAX)}
            </p>
          </div>
        </li>
      </GroupedList>
      <input type="hidden" name="botAiEnabled" value={values.botAiEnabled} />
      <GroupFooter dirty={form.dirty} pending={form.pending} error={form.error} />
    </form>
  );
}
