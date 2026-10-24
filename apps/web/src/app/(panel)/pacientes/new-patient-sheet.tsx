"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { PATIENT_DIRECTORY_TEXT } from "@nutri-bot/core";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/primitives/sheet";
import { Button, Field, FormError, Input } from "@/components/ui";
import { notify } from "@/lib/notify";
import { useMediaQuery } from "@/lib/use-media-query";
import { createPatientAction, type CreatePatientState } from "./actions";

const T = PATIENT_DIRECTORY_TEXT;
const initial: CreatePatientState = { ok: false };

/** "Nuevo paciente": nombre + WhatsApp. Al guardar abre la ficha para completar el resto. */
export function NewPatientSheet() {
  const compact = useMediaQuery("(max-width: 639px)");
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>
          <UserPlus aria-hidden />
          {T.newPatient}
        </Button>
      </SheetTrigger>
      <SheetContent side={compact ? "bottom" : "right"} className={compact ? undefined : "w-full sm:max-w-md"}>
        <SheetHeader>
          <SheetTitle>{T.newPatient}</SheetTitle>
          <SheetDescription>{T.newPatientDescription}</SheetDescription>
        </SheetHeader>
        {/* Se monta al abrir: cada apertura arranca con el form vacío. */}
        {open ? <NewPatientForm /> : null}
      </SheetContent>
    </Sheet>
  );
}

function NewPatientForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createPatientAction, initial);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  // Controlados: React 19 resetea los campos no controlados de un <form action> al terminar la action.
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (state.ok && state.id) {
      notify.saved(T.setNameDone(state.name ?? ""));
      router.push(`/pacientes/${state.id}`);
    } else if (state.fieldErrors?.name) nameRef.current?.focus();
    else if (state.fieldErrors?.phone) phoneRef.current?.focus();
    // Solo la identidad de `state`: cada respuesta de la action es un objeto nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const errors = state.ok ? undefined : state.fieldErrors;

  return (
    <form action={formAction} noValidate className="mt-6 space-y-6">
      <Field label={T.setNameField} error={errors?.name}>
        <Input
          ref={nameRef}
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          maxLength={120}
          autoComplete="off"
          className="h-11"
          aria-invalid={errors?.name ? true : undefined}
        />
      </Field>
      <div>
        <Field label={T.newPatientPhone} hint={T.newPatientPhoneHint} error={errors?.phone}>
          <Input
            ref={phoneRef}
            name="phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="off"
            enterKeyHint="done"
            className="h-11 tabular-nums"
            aria-invalid={errors?.phone ? true : undefined}
          />
        </Field>
        {!state.ok && state.existingId ? (
          <Link
            href={`/pacientes/${state.existingId}`}
            className="mt-1.5 inline-block text-footnote text-primary underline-offset-2 hover:underline"
          >
            {T.openExisting}
          </Link>
        ) : null}
      </div>
      <FormError message={state.ok ? null : state.error} />
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <Button type="submit" size="lg" loading={pending || state.ok} className="w-full sm:w-auto">
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
