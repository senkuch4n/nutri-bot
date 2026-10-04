"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { HIDDEN_NUMBER_TEXT, PATIENT_DIRECTORY_TEXT, type PatientDirectoryRow } from "@nutri-bot/core";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/primitives/sheet";
import { Button, Field, Input } from "@/components/ui";
import { useMediaQuery } from "@/lib/use-media-query";
import { setPatientNameAction, type SetPatientNameState } from "./actions";

const T = PATIENT_DIRECTORY_TEXT;
const initial: SetPatientNameState = { ok: false };

/** Sheet "Poner nombre" (HU-017c-1, SDD 5.5): un solo campo que escribe solo `Patient.name`.
 *  Lateral derecho desde 640 px; desde abajo en el celular. */
export function NameContactSheet({
  row,
  open,
  onOpenChange,
  onSaved,
  onCloseAutoFocus,
}: {
  row: PatientDirectoryRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (name: string) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const compact = useMediaQuery("(max-width: 639px)");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={compact ? "bottom" : "right"}
        className={compact ? undefined : "w-full sm:max-w-md"}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {row ? (
          <>
            <SheetHeader>
              <SheetTitle>{T.setNameTitle}</SheetTitle>
              <SheetDescription className="tabular-nums">{row.phoneLabel ?? HIDDEN_NUMBER_TEXT}</SheetDescription>
            </SheetHeader>
            {/* La key reinicia el estado del form (errores) cada vez que se abre para otro contacto. */}
            <NameContactForm key={row.id} id={row.id} onSaved={onSaved} />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function NameContactForm({ id, onSaved }: { id: string; onSaved: (name: string) => void }) {
  const [state, formAction, pending] = useActionState(setPatientNameAction, initial);
  const inputRef = useRef<HTMLInputElement>(null);
  // Controlado: React 19 resetea los campos no controlados de un <form action> al terminar la action,
  // y con un error ("No se pudo guardar") se perdería lo que se escribió.
  const [name, setName] = useState("");

  useEffect(() => {
    if (state.ok && state.name) onSaved(state.name);
    // Con error, el foco vuelve al campo (el error se anuncia con role="alert").
    else if (state.error) inputRef.current?.focus();
    // Solo la identidad de `state`: cada respuesta de la action es un objeto nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} noValidate className="mt-6 space-y-6">
      <input type="hidden" name="id" value={id} />
      <Field label={T.setNameField} error={state.ok ? undefined : state.error}>
        <Input
          ref={inputRef}
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          maxLength={120}
          autoComplete="off"
          enterKeyHint="done"
          className="h-11"
          aria-invalid={!state.ok && state.error ? true : undefined}
        />
      </Field>
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
          {T.save}
        </Button>
        <SheetClose asChild>
          <Button type="button" variant="secondary" size="lg" className="w-full sm:w-auto">
            {T.cancel}
          </Button>
        </SheetClose>
      </div>
    </form>
  );
}
