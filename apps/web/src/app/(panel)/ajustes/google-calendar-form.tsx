"use client";

import { useId, useTransition } from "react";
import { SETTINGS_TEXT as T } from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { Button, FormError, Input } from "@/components/ui";
import { notify } from "@/lib/notify";
import { disconnectGoogleAction, saveGoogleCalendarIdAction } from "./actions";
import { useSettingsForm } from "./settings-ui";

/** "Opciones avanzadas" de Google Calendar: el identificador de otro calendario (vacío = el principal). */
export function GoogleCalendarForm({ defaultId }: { defaultId: string }) {
  const form = useSettingsForm("google", { calendarId: defaultId }, saveGoogleCalendarIdAction);
  const id = useId();
  const helpId = useId();

  return (
    <form onSubmit={form.onSubmit} className="space-y-2 pt-2">
      <label htmlFor={id} className="block text-callout text-foreground">
        {T.googleCalendarIdLabel}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          id={id}
          name="calendarId"
          autoComplete="off"
          spellCheck={false}
          translate="no"
          className="min-w-0 flex-1 basis-60"
          aria-describedby={helpId}
          value={form.values.calendarId}
          onChange={(e) => form.set("calendarId", e.currentTarget.value)}
        />
        <Button type="submit" variant="secondary" loading={form.pending}>
          {form.pending ? T.saving : T.save}
        </Button>
      </div>
      <p id={helpId} className="text-footnote text-muted-foreground">
        {form.dirty && !form.pending ? `${T.unsaved}. ` : ""}
        {T.googleCalendarIdHelp}
      </p>
      <FormError message={form.error} />
    </form>
  );
}

/** "Desconectar" con confirmación (HU §4.8). */
export function GoogleDisconnectButton() {
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  async function handleClick() {
    if (pending) return;
    const ok = await confirm({
      title: T.googleDisconnectTitle,
      description: T.googleDisconnectDescription,
      confirmLabel: T.googleDisconnect,
      destructive: true,
    });
    if (!ok) return;
    start(async () => {
      try {
        await disconnectGoogleAction();
      } catch {
        notify.error();
      }
    });
  }

  return (
    <Button type="button" variant="plain" loading={pending} onClick={handleClick}>
      {T.googleDisconnect}
    </Button>
  );
}
