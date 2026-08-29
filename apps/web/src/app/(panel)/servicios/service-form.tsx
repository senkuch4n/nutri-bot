"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { saveServiceAction, type ServiceFormState } from "./actions";

export interface EditableService {
  id: string;
  name: string;
  description: string | null;
  price: string;
  durationMin: number;
  color: string;
  active: boolean;
}

const initial: ServiceFormState = { ok: false };

export function ServiceForm({ editing, onDone }: { editing?: EditableService; onDone?: () => void }) {
  const [state, action, pending] = useActionState(saveServiceAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const [color, setColor] = useState(editing?.color ?? "#2563eb");

  useEffect(() => {
    if (state.ok) {
      if (!editing) formRef.current?.reset();
      onDone?.();
    }
  }, [state.ok, editing, onDone]);

  return (
    <form ref={formRef} action={action} className="grid gap-4 sm:grid-cols-2">
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

      <Field label="Nombre">
        <Input name="name" defaultValue={editing?.name} required minLength={2} />
      </Field>

      <Field label="Precio">
        <Input name="price" type="number" min={0} step="0.01" defaultValue={editing?.price} required />
      </Field>

      <Field label="Duración (minutos)">
        <Input
          name="durationMin"
          type="number"
          min={5}
          step={5}
          defaultValue={editing?.durationMin ?? 30}
          required
        />
      </Field>

      <Field label="Color">
        <div className="flex items-center gap-2">
          <input
            name="color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-14 rounded border border-slate-300"
          />
          <span className="text-sm text-slate-500">{color}</span>
        </div>
      </Field>

      <div className="sm:col-span-2">
        <Field label="Descripción (opcional)">
          <Textarea name="description" rows={2} defaultValue={editing?.description ?? ""} />
        </Field>
      </div>

      {editing ? (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="active" defaultChecked={editing.active} value="true" />
          Servicio activo
        </label>
      ) : null}

      <div className="sm:col-span-2 flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear servicio"}
        </Button>
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        {state.ok ? <span className="text-sm text-green-600">Guardado.</span> : null}
      </div>
    </form>
  );
}
