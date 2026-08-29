"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button, Input, Select } from "@/components/ui";
import {
  addExceptionAction,
  addRuleAction,
  deleteExceptionAction,
  deleteRuleAction,
  type FormState,
} from "./actions";

const initial: FormState = { ok: false };

export function AddRuleForm({ weekday }: { weekday: number }) {
  const [state, action, pending] = useActionState(addRuleAction, initial);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="weekday" value={weekday} />
      <Input name="startTime" type="time" defaultValue="09:00" className="w-32" required />
      <span className="text-slate-400">a</span>
      <Input name="endTime" type="time" defaultValue="13:00" className="w-32" required />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "…" : "Agregar"}
      </Button>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}

export function AddExceptionForm() {
  const [state, action, pending] = useActionState(addExceptionAction, initial);
  const [type, setType] = useState<"BLOCKED" | "CUSTOM_HOURS">("BLOCKED");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setType("BLOCKED");
    }
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Fecha</span>
        <Input name="date" type="date" required />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Tipo</span>
        <Select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
        >
          <option value="BLOCKED">Bloquear (día u horario)</option>
          <option value="CUSTOM_HOURS">Horario especial</option>
        </Select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">
          Desde {type === "BLOCKED" ? "(opcional)" : ""}
        </span>
        <Input name="startTime" type="time" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">
          Hasta {type === "BLOCKED" ? "(opcional)" : ""}
        </span>
        <Input name="endTime" type="time" />
      </label>

      <label className="block sm:col-span-2">
        <span className="mb-1 block text-sm font-medium text-slate-700">Motivo (opcional)</span>
        <Input name="reason" placeholder="Feriado, congreso, etc." />
      </label>

      <div className="sm:col-span-2 flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Agregar excepción"}
        </Button>
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      </div>
      <p className="sm:col-span-2 text-xs text-slate-400">
        Bloquear sin horas = día completo. Bloquear con horas = solo ese tramo. Horario especial
        reemplaza el horario habitual de ese día.
      </p>
    </form>
  );
}

export function DeleteRuleButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => deleteRuleAction(id))}
      disabled={pending}
      className="text-sm text-red-600 hover:underline disabled:opacity-50"
    >
      Quitar
    </button>
  );
}

export function DeleteExceptionButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => deleteExceptionAction(id))}
      disabled={pending}
      className="text-sm text-red-600 hover:underline disabled:opacity-50"
    >
      Quitar
    </button>
  );
}
