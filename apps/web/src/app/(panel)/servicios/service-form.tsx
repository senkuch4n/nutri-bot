"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { saveServiceAction, type ServiceFormState } from "./actions";

export interface EditableService {
  id: string;
  name: string;
  description: string | null;
  price: string;
  durationMin: number;
  color: string;
  active: boolean;
  requiresDeposit: boolean;
  depositKind: "FIXED" | "PERCENT" | null;
  depositValue: string | null;
}

const initial: ServiceFormState = { ok: false };

const PRESET_COLORS = ["#5aa832", "#2563eb", "#db2777", "#d97706", "#7c3aed", "#0891b2"];

export function ServiceForm({ editing, onDone }: { editing?: EditableService; onDone?: () => void }) {
  const [state, action, pending] = useActionState(saveServiceAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const [color, setColor] = useState(editing?.color ?? PRESET_COLORS[0]!);
  const [requiresDeposit, setRequiresDeposit] = useState(editing?.requiresDeposit ?? false);

  useEffect(() => {
    if (state.ok) {
      if (!editing) formRef.current?.reset();
      onDone?.();
    }
  }, [state.ok, editing, onDone]);

  return (
    <form ref={formRef} action={action} className="grid gap-5 sm:grid-cols-2">
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      <input type="hidden" name="color" value={color} />

      <Field label="Nombre">
        <Input name="name" defaultValue={editing?.name} required minLength={2} autoFocus />
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
        <div className="flex flex-wrap items-center gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              className={
                "h-8 w-8 border-2 transition-transform " +
                (color.toLowerCase() === c ? "border-ink scale-110" : "border-transparent")
              }
              style={{ background: c }}
            />
          ))}
          <label className="ml-1 inline-flex h-8 cursor-pointer items-center border-2 border-line px-2 text-xs font-medium text-ink-soft hover:border-ink">
            Otro
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="ml-1 h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
            />
          </label>
        </div>
      </Field>

      <div className="sm:col-span-2">
        <Field label="Descripción (opcional)">
          <Textarea name="description" rows={2} defaultValue={editing?.description ?? ""} />
        </Field>
      </div>

      <div className="sm:col-span-2 space-y-3 border-t border-line pt-4">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="requiresDeposit"
            value="true"
            checked={requiresDeposit}
            onChange={(e) => setRequiresDeposit(e.target.checked)}
            className="h-4 w-4 accent-leaf"
          />
          Requiere seña para reservar por WhatsApp
        </label>

        {requiresDeposit ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de seña">
              <Select name="depositKind" defaultValue={editing?.depositKind ?? "PERCENT"}>
                <option value="PERCENT">Porcentaje del precio</option>
                <option value="FIXED">Monto fijo</option>
              </Select>
            </Field>
            <Field label="Valor">
              <Input
                name="depositValue"
                type="number"
                min={0}
                step="0.01"
                defaultValue={editing?.depositValue ?? ""}
                required={requiresDeposit}
              />
            </Field>
          </div>
        ) : null}
      </div>

      {editing ? (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="active"
            defaultChecked={editing.active}
            value="true"
            className="h-4 w-4 accent-leaf"
          />
          Servicio activo
        </label>
      ) : null}

      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear servicio"}
        </Button>
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        {state.ok ? <span className="text-sm text-leaf-deep">Guardado.</span> : null}
      </div>
    </form>
  );
}
