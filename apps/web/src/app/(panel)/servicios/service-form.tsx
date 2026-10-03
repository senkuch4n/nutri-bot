"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { NumberInput } from "@/components/number-input";
import { Label } from "@/components/primitives/label";
import { Switch } from "@/components/primitives/switch";
import { Button, Field, FormError, Input, Select, Textarea, cn } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
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
  prepInstructions: string | null;
  prepLeadHours: number | null;
  /** HU-013 (D4): el bot pide el motivo al reservar. */
  asksReason: boolean;
}

const initial: ServiceFormState = { ok: false };

// Colores del servicio (datos que se guardan, no tokens del sistema).
const PRESET_COLORS = ["#5aa832", "#2563eb", "#db2777", "#d97706", "#7c3aed", "#0891b2"];

export function ServiceForm({ editing, onDone }: { editing?: EditableService; onDone?: () => void }) {
  const [state, action, pending] = useActionState(saveServiceAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const [color, setColor] = useState(editing?.color ?? PRESET_COLORS[0]!);
  const [requiresDeposit, setRequiresDeposit] = useState(editing?.requiresDeposit ?? false);
  const [hasPrep, setHasPrep] = useState(Boolean(editing?.prepInstructions));
  const [asksReason, setAsksReason] = useState(editing?.asksReason ?? true);
  const reasonId = `pide-motivo-${editing?.id ?? "nuevo"}`;

  useActionToast(state, { success: editing ? "Servicio guardado" : "Servicio creado" });
  useEffect(() => {
    if (state.ok) {
      if (!editing) {
        formRef.current?.reset();
        // reset() no toca el estado controlado del switch.
        setAsksReason(true);
      }
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
          {PRESET_COLORS.map((c) => {
            const selected = color.toLowerCase() === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                aria-pressed={selected}
                className={cn(
                  "h-8 w-8 rounded-md ring-offset-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected && "ring-2 ring-foreground",
                )}
                style={{ background: c }}
              />
            );
          })}
          <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-input px-2 text-sm hover:bg-accent">
            Otro
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
            />
          </label>
        </div>
      </Field>

      <div className="sm:col-span-2">
        <Field label="Descripción (opcional)">
          <Textarea name="description" rows={2} defaultValue={editing?.description ?? ""} />
        </Field>
      </div>

      <div className="space-y-3 border-t pt-4 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="requiresDeposit"
            value="true"
            checked={requiresDeposit}
            onChange={(e) => setRequiresDeposit(e.target.checked)}
            className="h-4 w-4 accent-primary"
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

      <div className="space-y-3 border-t pt-4 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hasPrep}
            onChange={(e) => setHasPrep(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Mandar recomendaciones antes del turno (ej: estudios de antropometría o bioimpedancia)
        </label>

        {hasPrep ? (
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field label="Recomendaciones" hint="Se manda por WhatsApp antes del turno.">
              <Textarea
                name="prepInstructions"
                rows={2}
                defaultValue={editing?.prepInstructions ?? ""}
                required={hasPrep}
                placeholder="Ej: Vení en ayunas de 4hs y sin haber entrenado ese día."
              />
            </Field>
            <Field label="Horas antes">
              <NumberInput
                name="prepLeadHours"
                unit="h"
                step={1}
                min={1}
                max={168}
                defaultValue={editing?.prepLeadHours ?? 24}
                required={hasPrep}
                className="w-28"
              />
            </Field>
          </div>
        ) : null}
      </div>

      <div className="flex items-start justify-between gap-6 border-t pt-4 sm:col-span-2">
        <div>
          <Label htmlFor={reasonId} className="text-sm font-medium">
            Pedir motivo al reservar
          </Label>
          <p id={`${reasonId}-desc`} className="mt-1 text-sm text-muted-foreground">
            El bot le pide al paciente que cuente el motivo antes de confirmar el turno.
          </p>
        </div>
        <Switch
          id={reasonId}
          checked={asksReason}
          onCheckedChange={setAsksReason}
          aria-describedby={`${reasonId}-desc`}
        />
        <input type="hidden" name="asksReason" value={asksReason ? "1" : "0"} />
      </div>

      {editing ? (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            name="active"
            defaultChecked={editing.active}
            value="true"
            className="h-4 w-4 accent-primary"
          />
          Servicio activo
        </label>
      ) : null}

      <div className="flex items-center justify-end gap-3 sm:col-span-2">
        <Button type="submit" loading={pending}>
          {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear servicio"}
        </Button>
      </div>
      {state.error ? (
        <div className="sm:col-span-2">
          <FormError message={state.error} />
        </div>
      ) : null}
    </form>
  );
}
