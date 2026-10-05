"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AVAILABILITY_TEXT, type ExceptionKind } from "@nutri-bot/core";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/primitives/sheet";
import { Button, Input, cn } from "@/components/ui";
import { notify } from "@/lib/notify";
import { useMediaQuery } from "@/lib/use-media-query";
import { addExceptionAction, type FormState } from "./actions";

const T = AVAILABILITY_TEXT;
const KINDS: readonly ExceptionKind[] = ["closed_day", "closed_range", "custom_hours"];

/**
 * Panel "Agregar excepción" (HU-017b-2): qué pasa ese día en palabras ("No atiendo todo el día" / "No
 * atiendo un rato" / "Atiendo en otro horario"), la fecha, "Desde"/"Hasta" solo si hacen falta y el
 * motivo opcional. Las tres opciones van como lista de radios de 44 px: en un segmentado no entran
 * legibles en 390 px.
 */
export function ExceptionSheet({
  open,
  onOpenChange,
  todayKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todayKey: string;
}) {
  const compact = useMediaQuery("(max-width: 639px)");
  // Cada apertura remonta el formulario (vacío y sin errores).
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    if (open) setFormKey((k) => k + 1);
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={compact ? "bottom" : "right"} className={compact ? undefined : "w-full sm:max-w-md"}>
        <SheetHeader>
          <SheetTitle>{T.addException}</SheetTitle>
          <SheetDescription>Un día con un horario distinto al de todas las semanas.</SheetDescription>
        </SheetHeader>
        <ExceptionForm key={formKey} todayKey={todayKey} onDone={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

const initial: FormState = { ok: false };

function ExceptionForm({ todayKey, onDone }: { todayKey: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(addExceptionAction, initial);
  const [kind, setKind] = useState<ExceptionKind>("closed_day");
  const formRef = useRef<HTMLFormElement>(null);
  const ids = useId();
  const errorId = `${ids}-error`;

  useEffect(() => {
    if (state.ok) {
      notify.saved("Listo, se agregó el día especial");
      onDone();
      return;
    }
    if (state.error) {
      const target = state.field
        ? formRef.current?.querySelector<HTMLInputElement>(`[name="${state.field}"]`)
        : formRef.current?.querySelector<HTMLInputElement>('[name="date"]');
      target?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  const error = state.ok ? undefined : state.error;
  const withHours = kind !== "closed_day";
  // Error sin campo (fecha o tipo) → se marca la fecha.
  const invalidField = (name: "date" | "startTime" | "endTime") =>
    error && (state.field ?? "date") === name ? true : undefined;

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
      <fieldset>
        <legend className="mb-1.5 block text-subheadline font-medium text-foreground">Ese día</legend>
        <div className="overflow-hidden rounded-xl bg-secondary/60 more-contrast:border more-contrast:border-input">
          {KINDS.map((k) => (
            <label
              key={k}
              className={cn(
                "relative flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2.5 text-callout text-foreground",
                "after:absolute after:bottom-0 after:left-11 after:right-0 after:h-px after:bg-border last:after:hidden",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ring",
              )}
            >
              <input
                type="radio"
                name="kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
                className="size-5 shrink-0 accent-primary focus-visible:outline-none"
              />
              {T.exceptionKinds[k]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1.5 block text-subheadline font-medium text-foreground">Fecha</span>
        <Input
          name="date"
          type="date"
          required
          min={todayKey}
          defaultValue={todayKey}
          className="h-11"
          aria-invalid={invalidField("date")}
          aria-describedby={error ? errorId : undefined}
        />
      </label>

      {withHours ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-subheadline font-medium text-foreground">{T.from}</span>
            <Input
              name="startTime"
              type="time"
              required
              defaultValue={kind === "closed_range" ? "14:00" : "09:00"}
              className="h-11 tabular-nums"
              aria-invalid={invalidField("startTime")}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-subheadline font-medium text-foreground">{T.to}</span>
            <Input
              name="endTime"
              type="time"
              required
              defaultValue={kind === "closed_range" ? "16:00" : "13:00"}
              className="h-11 tabular-nums"
              aria-invalid={invalidField("endTime")}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
        </div>
      ) : null}

      <label className="block">
        <span className="mb-1.5 block text-subheadline font-medium text-foreground">{T.reasonLabel}</span>
        <Input name="reason" placeholder={T.reasonPlaceholder} maxLength={200} autoComplete="off" className="h-11" />
      </label>

      {error ? (
        <p id={errorId} role="alert" className="text-footnote text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={pending} className="w-full">
        {pending ? "Guardando…" : T.save}
      </Button>
    </form>
  );
}
