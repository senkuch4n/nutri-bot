"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AVAILABILITY_TEXT, type ExceptionKind } from "@nutri-bot/core";
import {
  MorphDialog,
  MorphDialogContent,
  MorphDialogDescription,
  MorphDialogHeader,
  MorphDialogTitle,
} from "@/components/primitives/morph-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/primitives/sheet";
import { Button, Input, cn, filledInputClass, filledSurfaceClass } from "@/components/ui";
import { notify } from "@/lib/notify";
import { useMediaQuery } from "@/lib/use-media-query";
import { addExceptionAction, type FormState } from "./actions";
import { FIELD_LABEL } from "./range-sheet";

const T = AVAILABILITY_TEXT;
const KINDS: readonly ExceptionKind[] = ["closed_day", "closed_range", "custom_hours"];

/**
 * Panel "Agregar excepción" (HU-017b-2): qué pasa ese día en palabras ("No atiendo todo el día" / "No
 * atiendo un rato" / "Atiendo en otro horario"), la fecha, "Desde"/"Hasta" solo si hacen falta y el
 * motivo opcional. Las tres opciones van como lista de radios de 44 px: en un segmentado no entran
 * legibles en 390 px. En pantallas anchas es un diálogo que crece desde el botón que lo abrió; en el
 * teléfono, una hoja desde abajo.
 */
export function ExceptionSheet({
  open,
  onOpenChange,
  origin = null,
  todayKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Elemento desde el que crece el diálogo. */
  origin?: HTMLElement | null;
  todayKey: string;
}) {
  const compact = useMediaQuery("(max-width: 639px)");
  // Cada apertura remonta el formulario (vacío y sin errores).
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    if (open) setFormKey((k) => k + 1);
  }, [open]);

  const description = "Un día con un horario distinto al de todas las semanas.";
  const form = <ExceptionForm key={formKey} todayKey={todayKey} onDone={() => onOpenChange(false)} />;

  if (compact) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="ink-accent bg-[#f9f8fa]">
          <SheetHeader>
            <SheetTitle>{T.addException}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          {form}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <MorphDialog open={open} onOpenChange={onOpenChange} origin={origin}>
      {/* anchor="origin": se transforma en el lugar del botón (no viaja al centro). */}
      <MorphDialogContent className="ink-accent w-[min(100%,30rem)] bg-[#f9f8fa]" closeSide="left" anchor="origin">
        <MorphDialogHeader className="min-h-10 justify-center pl-14 pr-0">
          <MorphDialogTitle className="text-title-2 font-normal text-muted-foreground">{T.addException}</MorphDialogTitle>
        </MorphDialogHeader>
        <MorphDialogDescription className="mt-4 px-1">{description}</MorphDialogDescription>
        {form}
      </MorphDialogContent>
    </MorphDialog>
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
        <legend className={FIELD_LABEL}>Ese día</legend>
        <div className={cn(filledSurfaceClass, "divide-y divide-[#f9f8fa] overflow-hidden more-contrast:border more-contrast:border-input")}>
          {KINDS.map((k) => (
            <label
              key={k}
              className={cn(
                "flex min-h-[3.25rem] cursor-pointer items-center gap-3 px-5 py-2.5 text-body text-foreground",
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
        <span className={FIELD_LABEL}>Fecha</span>
        <Input
          name="date"
          type="date"
          required
          min={todayKey}
          defaultValue={todayKey}
          className={`${filledInputClass} tabular-nums`}
          aria-invalid={invalidField("date")}
          aria-describedby={error ? errorId : undefined}
        />
      </label>

      {withHours ? (
        // R5 (017b-3): `key` por tipo → al cambiar de tipo, Desde/Hasta vuelven a los valores del tipo nuevo.
        <div key={kind} className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={FIELD_LABEL}>{T.from}</span>
            <Input
              name="startTime"
              type="time"
              required
              defaultValue={kind === "closed_range" ? "14:00" : "09:00"}
              className={`${filledInputClass} tabular-nums`}
              aria-invalid={invalidField("startTime")}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
          <label className="block">
            <span className={FIELD_LABEL}>{T.to}</span>
            <Input
              name="endTime"
              type="time"
              required
              defaultValue={kind === "closed_range" ? "16:00" : "13:00"}
              className={`${filledInputClass} tabular-nums`}
              aria-invalid={invalidField("endTime")}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
        </div>
      ) : null}

      <label className="block">
        <span className={FIELD_LABEL}>{T.reasonLabel}</span>
        <Input name="reason" placeholder={T.reasonPlaceholder} maxLength={200} autoComplete="off" className={filledInputClass} />
      </label>

      {error ? (
        <p id={errorId} role="alert" className="px-1 text-footnote text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={pending} className="w-full rounded-full">
        {pending ? "Guardando…" : T.save}
      </Button>
    </form>
  );
}
