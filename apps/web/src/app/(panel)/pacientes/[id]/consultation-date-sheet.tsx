"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { CONSULTATION_TEXT } from "@nutri-bot/core";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/primitives/sheet";
import { Alert, Button, ButtonLink, Field, FormError, Input } from "@/components/ui";
import { notify } from "@/lib/notify";
import {
  createConsultationAction,
  updateConsultationDateAction,
  type ConsultationFormState,
} from "./consultation-actions";

type Props =
  | { mode: "create"; patientId: string; todayKey: string; trigger: ReactNode }
  | {
      mode: "edit";
      patientId: string;
      consultationId: string;
      todayKey: string;
      currentDayKey: string;
      trigger: ReactNode;
    };

const initial: ConsultationFormState = { ok: false };

/** Sheet "Nueva consulta" (sin turno) / "Cambiar fecha" (solo consultas sin turno). */
export function ConsultationDateSheet(props: Props) {
  const [open, setOpen] = useState(false);
  // El form se remonta cada vez que se abre: arranca sin errores ni aviso de duplicado.
  const [formKey, setFormKey] = useState(0);
  const isCreate = props.mode === "create";

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setFormKey((k) => k + 1);
      }}
    >
      <SheetTrigger asChild>{props.trigger}</SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>{isCreate ? "Nueva consulta" : "Cambiar fecha"}</SheetTitle>
          <SheetDescription>
            {isCreate
              ? "Consulta sin turno. La fecha no puede ser futura."
              : "Las mediciones de la consulta pasan a esta fecha."}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6">
          <DateForm key={formKey} {...props} onDone={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DateForm(props: Props & { onDone: () => void }) {
  const router = useRouter();
  const isCreate = props.mode === "create";
  const [state, action, pending] = useActionState(
    isCreate ? createConsultationAction : updateConsultationDateAction,
    initial,
  );
  const { patientId, onDone } = props;

  useEffect(() => {
    if (!state.ok) return;
    if (isCreate) {
      notify.saved("Consulta creada");
      router.push(`/pacientes/${patientId}/consultas/${state.consultationId}`);
    } else {
      notify.saved("Fecha actualizada");
      onDone();
    }
    // Solo la identidad de `state`: cada action devuelve un objeto nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const duplicate = isCreate && state.existingConsultationId ? state.existingConsultationId : null;
  // El aviso D5 reemplaza al error en línea (mismo texto): no se repite.
  const inlineError = duplicate ? null : state.error;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="patientId" value={patientId} />
      {props.mode === "edit" ? <input type="hidden" name="consultationId" value={props.consultationId} /> : null}
      <Field label="Fecha">
        <Input
          type="date"
          name="day"
          max={props.todayKey}
          defaultValue={props.mode === "edit" ? props.currentDayKey : props.todayKey}
          required
          aria-invalid={inlineError ? true : undefined}
        />
      </Field>
      <FormError message={inlineError} />

      {duplicate ? (
        <Alert tone="warning" title={CONSULTATION_TEXT.sameDayExists}>
          <p>Podés abrir la que ya existe o crear otra igual.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink
              variant="secondary"
              size="sm"
              href={`/pacientes/${patientId}/consultas/${duplicate}`}
              onClick={onDone}
            >
              Abrir consulta
            </ButtonLink>
            <Button type="submit" name="force" value="1" variant="ghost" size="sm" disabled={pending}>
              Crear igual
            </Button>
          </div>
        </Alert>
      ) : null}

      <Button type="submit" loading={pending} className="w-full">
        {isCreate ? (pending ? "Creando…" : "Crear consulta") : pending ? "Guardando…" : "Guardar fecha"}
      </Button>
    </form>
  );
}

/** Botón primario "Nueva consulta" que abre el sheet en modo creación. */
export function NewConsultationButton({ patientId, todayKey }: { patientId: string; todayKey: string }) {
  return (
    <ConsultationDateSheet
      mode="create"
      patientId={patientId}
      todayKey={todayKey}
      trigger={
        <Button type="button" size="sm">
          <Plus aria-hidden />
          Nueva consulta
        </Button>
      }
    />
  );
}
