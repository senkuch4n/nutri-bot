"use client";

import { useSearchParams } from "next/navigation";
import {
  createContext,
  startTransition,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Pencil } from "lucide-react";
import {
  ACTIVITY_LEVELS,
  ACTIVITY_PLAIN_LABELS,
  BODY_FRAMES,
  NUTRITION_GOALS,
  PATIENT_SUMMARY_TEXT,
  SEX_OPTIONS,
  type ActivityLevel,
  type BodyFrame,
  type NutritionGoal,
  type Sex,
} from "@nutri-bot/core";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/primitives/sheet";
import { Button, Field, FormError, Input, Select, Textarea } from "@/components/ui";
import { notify } from "@/lib/notify";
import { replaceUrlInRouter, withoutSearchParam } from "@/lib/patient-tab-route";
import { useMediaQuery } from "@/lib/use-media-query";
import { updatePatientDataAction, type PatientDataState } from "../actions";

const T = PATIENT_SUMMARY_TEXT;

export interface EditablePatientData {
  id: string;
  name: string | null;
  /** "yyyy-MM-dd" o null. */
  birthDate: string | null;
  notes: string | null;
  sex: Sex | null;
  activityLevel: ActivityLevel | null;
  nutritionGoal: NutritionGoal | null;
  bodyFrame: BodyFrame | null;
  background: string | null;
  goals: string | null;
  riskFlag: boolean;
}

const EditPatientContext = createContext<(() => void) | null>(null);

/**
 * Sheet "Editar datos" (HU-017c-2, D9/Q8): un solo panel con tres grupos y un "Guardar". Lo abren
 * "Editar datos", "Completar" (aviso de faltantes) y `?editar=datos` (enlaces "Completar" de la consulta
 * y del estudio ISAK). Lateral derecho desde 640 px; desde abajo en el celular.
 */
export function EditPatientProvider({
  patient,
  todayKey,
  children,
}: {
  patient: EditablePatientData;
  todayKey: string;
  children: ReactNode;
}) {
  const params = useSearchParams();
  const fromUrl = params.get("editar") === "datos";
  const [open, setOpen] = useState(fromUrl);
  // Cada apertura remonta el formulario: arranca con los datos actuales y sin errores.
  const [formKey, setFormKey] = useState(0);
  const compact = useMediaQuery("(max-width: 639px)");

  useEffect(() => {
    if (fromUrl) setOpen(true);
  }, [fromUrl]);

  const openSheet = useCallback(() => {
    setFormKey((k) => k + 1);
    setOpen(true);
  }, []);

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (next) return;
    // Al cerrar, `?editar=datos` sale de la URL (recargar no lo vuelve a abrir).
    // `replaceUrlInRouter` (estado null): Next se entera y una server action posterior no lo vuelve a poner.
    replaceUrlInRouter(withoutSearchParam(window.location.href, "editar"));
  }, []);

  return (
    <EditPatientContext.Provider value={openSheet}>
      {children}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side={compact ? "bottom" : "right"} className={compact ? undefined : "w-full sm:max-w-lg"}>
          <SheetHeader>
            <SheetTitle>{T.editData}</SheetTitle>
            <SheetDescription>{patient.name ?? T.unnamed}</SheetDescription>
          </SheetHeader>
          <EditPatientForm key={formKey} patient={patient} todayKey={todayKey} onDone={() => onOpenChange(false)} />
        </SheetContent>
      </Sheet>
    </EditPatientContext.Provider>
  );
}

/** Abre el Sheet "Editar datos". */
export function useEditPatient(): () => void {
  const open = useContext(EditPatientContext);
  if (!open) throw new Error("useEditPatient fuera de EditPatientProvider");
  return open;
}

/** Botón que abre "Editar datos" (secundario por defecto; "Completar" usa otro texto y estilo). */
export function EditPatientButton({
  children,
  variant = "secondary",
  size = "md",
}: {
  children?: ReactNode;
  variant?: "secondary" | "tinted" | "plain";
  size?: "sm" | "md";
}) {
  const open = useEditPatient();
  return (
    <Button type="button" variant={variant} size={size} onClick={open}>
      {children ?? (
        <>
          <Pencil aria-hidden />
          {T.editData}
        </>
      )}
    </Button>
  );
}

const initial: PatientDataState = { ok: false };

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 text-headline text-foreground">{legend}</legend>
      {children}
    </fieldset>
  );
}

function EditPatientForm({
  patient,
  todayKey,
  onDone,
}: {
  patient: EditablePatientData;
  todayKey: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updatePatientDataAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state.ok ? {} : (state.fieldErrors ?? {});

  useEffect(() => {
    if (state.ok) {
      notify.saved(T.dataSaved);
      onDone();
      return;
    }
    // Con error, el foco va al primer campo marcado (el mensaje se anuncia con role="alert").
    const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    first?.focus();
    // Solo la identidad de `state`: cada respuesta de la action es un objeto nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Sin `action={…}` en el <form>: React 19 resetea los campos no controlados al terminar una form
  // action, y con un error se perdería lo escrito. Se envía a mano dentro de una transición.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  const invalid = (key: keyof typeof errors) => (errors[key] ? true : undefined);

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-6 space-y-8">
      <input type="hidden" name="id" value={patient.id} />

      <Group legend="Personales">
        <Field label="Nombre y apellido" error={errors.name}>
          <Input
            name="name"
            defaultValue={patient.name ?? ""}
            maxLength={120}
            autoComplete="off"
            className="h-11"
            aria-invalid={invalid("name")}
          />
        </Field>
        <Field label="Fecha de nacimiento" hint="Para calcular la edad." error={errors.birthDate}>
          <Input
            type="date"
            name="birthDate"
            defaultValue={patient.birthDate ?? ""}
            max={todayKey}
            className="h-11"
            aria-invalid={invalid("birthDate")}
          />
        </Field>
        <Field label="Notas" error={errors.notes}>
          <Textarea name="notes" rows={3} defaultValue={patient.notes ?? ""} maxLength={2000} aria-invalid={invalid("notes")} />
        </Field>
      </Group>

      <Group legend="Para calcular calorías">
        <Field label="Sexo" hint="El biológico: lo usan las fórmulas.">
          <Select name="sex" defaultValue={patient.sex ?? ""} className="h-11">
            <option value="">{T.notLoaded}</option>
            {SEX_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Actividad física">
          <Select name="activityLevel" defaultValue={patient.activityLevel ?? ""} className="h-11">
            <option value="">{T.notLoaded}</option>
            {ACTIVITY_LEVELS.map((o) => (
              <option key={o.value} value={o.value}>
                {`${ACTIVITY_PLAIN_LABELS[o.value]}: ${o.description}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Objetivo">
          <Select name="nutritionGoal" defaultValue={patient.nutritionGoal ?? ""} className="h-11">
            <option value="">{T.notLoaded}</option>
            {NUTRITION_GOALS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Contextura" hint={T.bodyFrameDefault}>
          <Select name="bodyFrame" defaultValue={patient.bodyFrame ?? ""} className="h-11">
            <option value="">{T.notLoaded}</option>
            {BODY_FRAMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </Group>

      <Group legend="Ficha clínica">
        <Field label="Antecedentes" hint="Enfermedades, alergias, medicación, cirugías…" error={errors.background}>
          <Textarea
            name="background"
            rows={4}
            defaultValue={patient.background ?? ""}
            maxLength={4000}
            aria-invalid={invalid("background")}
          />
        </Field>
        <label className="flex min-h-11 items-start gap-3 text-callout">
          <input
            type="checkbox"
            name="riskFlag"
            value="true"
            defaultChecked={patient.riskFlag}
            className="mt-0.5 size-5 shrink-0 rounded border-input accent-primary"
          />
          <span>
            <span className="block font-medium">Antecedentes de riesgo</span>
            <span className="block text-muted-foreground">
              Se muestran como aviso arriba de la ficha (alergias o enfermedades a tener en cuenta al armar el plan).
            </span>
          </span>
        </label>
        <Field label="Objetivos clínicos" hint="Qué busca lograr con el tratamiento." error={errors.goals}>
          <Textarea name="goals" rows={3} defaultValue={patient.goals ?? ""} maxLength={4000} aria-invalid={invalid("goals")} />
        </Field>
      </Group>

      <FormError message={state.ok ? undefined : state.error} />

      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        <SheetClose asChild>
          <Button type="button" variant="secondary" size="lg" className="w-full sm:w-auto">
            Cancelar
          </Button>
        </SheetClose>
      </div>
    </form>
  );
}
