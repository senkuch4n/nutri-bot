"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
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
      <p className="border border-dashed border-line px-3 py-6 text-center text-sm text-ink-faint">
        Sin excepciones cargadas.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {exceptions.map((e) => (
        <ExceptionChip key={e.id} exc={e} />
      ))}
    </ul>
  );
}

function ExceptionChip({ exc }: { exc: ExceptionView }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex items-center justify-between gap-3 border border-line bg-paper px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className={"h-9 w-1 shrink-0 " + (exc.blocked ? "bg-red-400" : "bg-leaf")} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold capitalize text-ink">{exc.dateLabel}</p>
          <p className="truncate text-xs text-ink-soft">
            {exc.detail}
            {exc.reason ? <span className="text-ink-faint"> · {exc.reason}</span> : null}
          </p>
        </div>
      </div>
      <button
        onClick={() => start(() => deleteExceptionAction(exc.id))}
        disabled={pending}
        aria-label={`Quitar excepción del ${exc.dateLabel}`}
        title="Quitar"
        className="shrink-0 p-1 text-ink-faint transition-colors hover:text-red-600 focus-visible:text-red-600 disabled:opacity-40"
      >
        ×
      </button>
    </li>
  );
}

const initialState: FormState = { ok: false };

export function ExceptionForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(addExceptionAction, initialState);
  const [type, setType] = useState<"BLOCKED" | "CUSTOM_HOURS">("BLOCKED");
  const ref = useRef<HTMLFormElement>(null);

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

      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Agregar excepción"}
        </Button>
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      </div>
      <p className="text-xs leading-relaxed text-ink-faint sm:col-span-2">
        Bloquear sin horas = día completo. Bloquear con horas = solo ese tramo. Horario especial
        reemplaza el horario habitual de ese día.
      </p>
    </form>
  );
}
