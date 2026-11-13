"use client";

import { useId } from "react";
import { SETTINGS_TEXT as T } from "@nutri-bot/core";
import { GroupedList } from "@/components/grouped-list";
import { Switch } from "@/components/primitives/switch";
import { Input } from "@/components/ui";
import { saveAfterHoursAction } from "./actions";
import { GroupFooter, SwitchRow, useSettingsForm } from "./settings-ui";

/**
 * HU-011 (D1): horario de atención de la opción 0. Fuera de él, el bot toma la consulta y la resume al
 * terminar la franja. HU-017b-4: "Atendés consultas de X a Y" (X = `attendFrom` = fin de la franja fuera
 * de horario, Y = `attendTo` = inicio). Mismos campos y misma action.
 */
export function AfterHoursForm({
  defaults,
}: {
  defaults: { enabled: boolean; attendFrom: string; attendTo: string };
}) {
  const form = useSettingsForm(
    "whatsapp",
    { afterHoursEnabled: defaults.enabled ? "1" : "0", attendFrom: defaults.attendFrom, attendTo: defaults.attendTo },
    saveAfterHoursAction,
  );
  const { values, set } = form;
  const enabled = values.afterHoursEnabled === "1";
  const fromId = useId();
  const toId = useId();

  return (
    <form onSubmit={form.onSubmit}>
      <GroupedList
        header={T.afterHoursTitle}
        footer={enabled ? T.afterHoursOn(values.attendFrom || "—") : T.afterHoursOff}
      >
        <SwitchRow
          label={T.afterHoursToggle}
          labelFor="after-hours-activo"
          control={
            <Switch
              id="after-hours-activo"
              checked={enabled}
              onCheckedChange={(checked) => set("afterHoursEnabled", checked ? "1" : "0")}
            />
          }
        />
        {/* Los horarios siguen editables con el switch apagado, así no se pierden. */}
        <li className="relative flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <label htmlFor={fromId} className="text-callout text-foreground">
            {T.attendFrom}
          </label>
          <Input
            id={fromId}
            type="time"
            name="attendFrom"
            required
            autoComplete="off"
            className="w-32"
            value={values.attendFrom}
            onChange={(e) => set("attendFrom", e.currentTarget.value)}
          />
          <label htmlFor={toId} className="text-callout text-foreground">
            {T.attendTo}
          </label>
          <Input
            id={toId}
            type="time"
            name="attendTo"
            required
            autoComplete="off"
            className="w-32"
            value={values.attendTo}
            onChange={(e) => set("attendTo", e.currentTarget.value)}
          />
        </li>
      </GroupedList>
      <input type="hidden" name="afterHoursEnabled" value={values.afterHoursEnabled} />
      <GroupFooter dirty={form.dirty} pending={form.pending} error={form.error} />
    </form>
  );
}
