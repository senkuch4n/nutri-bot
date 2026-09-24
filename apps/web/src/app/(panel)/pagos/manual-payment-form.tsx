"use client";

import { useActionState, useEffect } from "react";
import { Button, EmptyState, Field, FormError, Input, Select } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
import { registerManualPaymentAction, type PaymentFormState } from "./actions";

const initial: PaymentFormState = { ok: false };

export interface AppointmentOption {
  id: string;
  label: string;
  priceSnapshot: string;
}

export function ManualPaymentForm({
  appointments,
  onDone,
}: {
  appointments: AppointmentOption[];
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(registerManualPaymentAction, initial);

  useActionToast(state, { success: "Pago registrado" });
  useEffect(() => {
    if (state.ok) onDone?.();
  }, [state, onDone]);

  if (appointments.length === 0) {
    return (
      <EmptyState
        title="No hay turnos para asociar"
        description="Tiene que haber un turno confirmado entre hace 7 días y dentro de 7 días."
      />
    );
  }

  return (
    <form action={action} className="grid gap-4">
      <Field label="Turno">
        <Select name="appointmentId" defaultValue={appointments[0]?.id}>
          {appointments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo">
          <Select name="kind" defaultValue="FULL">
            <option value="FULL">Pago total</option>
            <option value="DEPOSIT">Seña</option>
          </Select>
        </Field>
        <Field label="Monto">
          <Input type="number" name="amount" step="0.01" min="0" required />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="submit" loading={pending}>
          {pending ? "Guardando…" : "Registrar pago"}
        </Button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}
