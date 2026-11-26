"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, m, useReducedMotionConfig } from "motion/react";
import { GOOGLE_CALENDAR_TEXT as G, SETTINGS_TEXT as T, type GoogleCalendarCallbackResult } from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { Alert, Button, FormError, Input } from "@/components/ui";
import { fades } from "@/lib/motion";
import { notify } from "@/lib/notify";
import { replaceUrlInRouter } from "@/lib/patient-tab-route";
import { connectGoogleCalendarAction, disconnectGoogleAction, saveGoogleCalendarIdAction } from "./actions";
import { useSettingsForm } from "./settings-ui";

// HU-028b: piezas cliente de Ajustes → Google Calendar. Solo reciben lo de GoogleCalendarConnectionView
// (sin tokens). Conectar usa el OAuth propio del calendario, no el login (D15).

function SubmitButton({ label, variant, disabled }: { label: string; variant: "primary" | "secondary"; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} loading={pending} disabled={disabled}>
      {label}
    </Button>
  );
}

/** "Conectar Google Calendar" / "Reconectar": server action que manda a Google a autorizar el calendario. */
export function GoogleCalendarConnectButton({
  reconnect = false,
  variant = "primary",
  disabled = false,
}: {
  reconnect?: boolean;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  return (
    <form action={connectGoogleCalendarAction}>
      <SubmitButton label={reconnect ? T.googleReconnect : T.googleConnect} variant={variant} disabled={disabled} />
    </form>
  );
}

const BANNER_MS = 8_000;

function isCallbackResult(value: string | null): value is GoogleCalendarCallbackResult {
  return value !== null && Object.prototype.hasOwnProperty.call(G.callback, value);
}

/** Resultado de la vuelta de Google (`?gcal=`). Saca `gcal` de la URL enseguida (sin ida al servidor)
 *  para que recargar no lo repita, y se oculta solo a los 8 s. */
export function GoogleCalendarCallbackBanner() {
  const param = useSearchParams().get("gcal");
  const [result, setResult] = useState<GoogleCalendarCallbackResult | null>(null);
  const reduced = Boolean(useReducedMotionConfig());

  useEffect(() => {
    if (!isCallbackResult(param)) return;
    setResult(param);
    const url = new URL(window.location.href);
    url.searchParams.delete("gcal");
    replaceUrlInRouter(url.toString());
  }, [param]);

  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(() => setResult(null), BANNER_MS);
    return () => window.clearTimeout(timer);
  }, [result]);

  const tone = result === "connected" ? "success" : result === "denied" ? "warning" : "danger";

  return (
    <AnimatePresence initial={false}>
      {result ? (
        <m.div
          key={result}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduced ? { duration: 0 } : fades.fast}
        >
          <Alert tone={tone}>
            <p>{G.callback[result]}</p>
          </Alert>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

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
