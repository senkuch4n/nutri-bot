"use client";

import { useActionState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { registerManualPaymentAction, type PaymentFormState } from "./actions";

const initial: PaymentFormState = { ok: false };

export interface AppointmentOption {
  id: string;
  label: string;
  priceSnapshot: string;
}

export function ManualPaymentForm({ appointments }: { appointments: AppointmentOption[] }) {
  const [state, action, pending] = useActionState(registerManualPaymentAction, initial);

  if (appointments.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        No hay turnos confirmados recientes para asociar un pago manual.
      </p>
    );
  }

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[2fr_auto_auto_auto] sm:items-end">
      <Field label="Turno">
        <Select name="appointmentId" defaultValue={appointments[0]?.id}>
          {appointments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Tipo">
        <Select name="kind" defaultValue="FULL" className="w-32">
          <option value="FULL">Pago total</option>
          <option value="DEPOSIT">Seña</option>
        </Select>
      </Field>
      <Field label="Monto">
        <Input type="number" name="amount" step="0.01" min="0" required className="w-28" />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Registrar pago"}
      </Button>
      {state.error ? <span className="reveal text-sm text-red-600 sm:col-span-4">{state.error}</span> : null}
      {state.ok ? (
        <span className="reveal text-sm font-medium text-leaf-deep sm:col-span-4">✓ Registrado</span>
      ) : null}
    </form>
  );
}
