"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { formatPrice } from "@nutri-bot/core";
import { Button, EmptyState, Field, FormError, Input, Select } from "@/components/ui";
import { notify } from "@/lib/notify";
import { registerManualPaymentAction, type PaymentFormState } from "./actions";

const initial: PaymentFormState = { ok: false };

export interface AppointmentOption {
  id: string;
  label: string;
  priceSnapshot: string;
  /** Opcional (017b-1): para el toast "Pago registrado: $ 15.000 de Brenda Yebara". */
  patientLabel?: string;
}

/** "15000.00" → "15000" (el input numérico arranca con el precio del turno). */
function amountFromPrice(priceSnapshot: string | undefined): string {
  const n = Number(priceSnapshot);
  return priceSnapshot !== undefined && Number.isFinite(n) ? String(n) : "";
}

export function ManualPaymentForm({
  appointments,
  onDone,
  defaultAppointmentId,
  currency,
}: {
  appointments: AppointmentOption[];
  /** HU-017b-1: recibe el tipo y el monto registrados (el consumidor puede ignorarlos). */
  onDone?: (r: { kind: "DEPOSIT" | "FULL"; amount: number }) => void;
  /** HU-017b-1: turno elegido al abrir (si no, el primero, como siempre). */
  defaultAppointmentId?: string;
  /** HU-017b-1: para el toast con el monto. */
  currency?: string;
}) {
  const [state, action, pending] = useActionState(registerManualPaymentAction, initial);
  const firstId =
    defaultAppointmentId && appointments.some((a) => a.id === defaultAppointmentId)
      ? defaultAppointmentId
      : appointments[0]?.id;
  const [appointmentId, setAppointmentId] = useState(firstId ?? "");
  const [amount, setAmount] = useState(() =>
    amountFromPrice(appointments.find((a) => a.id === firstId)?.priceSnapshot),
  );

  // Se lee en el efecto sin ser dependencia: los consumidores pasan callbacks inline.
  const latest = useRef({ onDone, appointments, appointmentId, currency });
  latest.current = { onDone, appointments, appointmentId, currency };

  useEffect(() => {
    // Solo la identidad de `state`: cada action devuelve un objeto nuevo.
    if (!state.ok) return;
    const { onDone: done, appointments: list, appointmentId: id, currency: cur } = latest.current;
    const patientLabel = list.find((a) => a.id === id)?.patientLabel;
    const kind = state.kind ?? "FULL";
    const paid = state.amount ?? 0;
    notify.saved(patientLabel && cur ? `Pago registrado: ${formatPrice(paid, cur)} de ${patientLabel}` : "Pago registrado");
    done?.({ kind, amount: paid });
  }, [state]);

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
        <Select
          name="appointmentId"
          value={appointmentId}
          onChange={(e) => {
            const id = e.target.value;
            setAppointmentId(id);
            setAmount(amountFromPrice(appointments.find((a) => a.id === id)?.priceSnapshot));
          }}
        >
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
          <Input
            type="number"
            name="amount"
            step="0.01"
            min="0"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
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
