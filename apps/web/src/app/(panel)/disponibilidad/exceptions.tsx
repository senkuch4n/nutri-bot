"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Ban, CalendarOff, Clock, X } from "lucide-react";
import { Button, EmptyState, Field, FormError, Input, Select } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
import { addExceptionAction, deleteExceptionAction, type FormState } from "./actions";

export interface ExceptionView {
  id: string;
  dateLabel: string;
  detail: string;
  reason: string | null;
  blocked: boolean;
}

export function ExceptionsList({ exceptions }: { exceptions: ExceptionView[] }) {
  if (exceptions.length === 0) {
    return (
      <EmptyState
        icon={CalendarOff}
        title="Sin excepciones cargadas"
        description="Feriados, días libres u horarios especiales."
      />
    );
  }
  return (
    <ul className="divide-y">
      {exceptions.map((e) => (
        <ExceptionItem key={e.id} exc={e} />
      ))}
    </ul>
  );
}

function ExceptionItem({ exc }: { exc: ExceptionView }) {
  const [pending, start] = useTransition();
  // Ícono por tipo (no solo color): Ban = bloqueado, Clock = horario especial.
  const Icon = exc.blocked ? Ban : Clock;
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <Icon
          className={"mt-0.5 h-4 w-4 shrink-0 " + (exc.blocked ? "text-destructive" : "text-foreground")}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium capitalize">{exc.dateLabel}</p>
          <p className="truncate text-sm text-muted-foreground">
            {exc.detail}
            {exc.reason ? ` · ${exc.reason}` : null}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => start(() => deleteExceptionAction(exc.id))}
        disabled={pending}
        aria-label={`Quitar excepción del ${exc.dateLabel}`}
        title="Quitar"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </li>
  );
}

const initialState: FormState = { ok: false };

export function ExceptionForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(addExceptionAction, initialState);
  const [type, setType] = useState<"BLOCKED" | "CUSTOM_HOURS">("BLOCKED");
  const ref = useRef<HTMLFormElement>(null);

  useActionToast(state, { success: "Excepción agregada" });
  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      onDone();
    }
  }, [state.ok, onDone]);

  const optional = type === "BLOCKED";

  return (
    <form ref={ref} action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Fecha">
        <Input name="date" type="date" required />
      </Field>
      <Field label="Tipo">
        <Select name="type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="BLOCKED">Bloquear (día u horario)</option>
          <option value="CUSTOM_HOURS">Horario especial</option>
        </Select>
      </Field>

      <Field label={`Desde${optional ? " (opcional)" : ""}`}>
        <Input name="startTime" type="time" />
      </Field>
      <Field label={`Hasta${optional ? " (opcional)" : ""}`}>
        <Input name="endTime" type="time" />
      </Field>

      <div className="sm:col-span-2">
        <Field label="Motivo (opcional)">
          <Input name="reason" placeholder="Feriado, congreso, etc." />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-3 sm:col-span-2">
        <Button type="submit" loading={pending}>
          {pending ? "Guardando…" : "Agregar excepción"}
        </Button>
      </div>
      {state.error ? (
        <div className="sm:col-span-2">
          <FormError message={state.error} />
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground sm:col-span-2">
        Bloquear sin horas = día completo. Bloquear con horas = solo ese tramo. Horario especial
        reemplaza el horario habitual de ese día.
      </p>
    </form>
  );
}
