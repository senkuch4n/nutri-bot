"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PAYMENT_TEXT, formatPrice } from "@nutri-bot/core";
import { SegmentedControl } from "@/components/segmented-control";
import { Button, EmptyState, Field, FormError, Input, Select } from "@/components/ui";
import { notify } from "@/lib/notify";
import { registerManualPaymentAction, type PaymentFormState } from "./actions";

const initial: PaymentFormState = { ok: false };

type Kind = "FULL" | "DEPOSIT";

export interface AppointmentOption {
  id: string;
  label: string;
  priceSnapshot: string;
  /** Opcional (017b-1): para el toast "Pago registrado: $ 15.000 de Brenda Yebara". */
  patientLabel?: string;
  /** Opcional (017b-3): seña configurada del servicio; se precarga al elegir "Seña". */
  depositAmount?: string;
}

/** "15000.00" → "15000" (el input numérico arranca con el precio del turno). */
function amountFromPrice(priceSnapshot: string | undefined): string {
  const n = Number(priceSnapshot);
  return priceSnapshot !== undefined && Number.isFinite(n) ? String(n) : "";
}

function defaultAmount(option: AppointmentOption | undefined, kind: Kind): string {
  if (kind === "DEPOSIT" && option?.depositAmount) return amountFromPrice(option.depositAmount);
  return amountFromPrice(option?.priceSnapshot);
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
  const [kind, setKind] = useState<Kind>("FULL");
  const [amount, setAmount] = useState(() =>
    defaultAmount(
      appointments.find((a) => a.id === firstId),
      "FULL",
    ),
  );

  // Se lee en el efecto sin ser dependencia: los consumidores pasan callbacks inline.
  const latest = useRef({ onDone, appointments, appointmentId, currency });
  latest.current = { onDone, appointments, appointmentId, currency };

  useEffect(() => {
    // Solo la identidad de `state`: cada action devuelve un objeto nuevo.
    if (!state.ok) return;
    const { onDone: done, appointments: list, appointmentId: id, currency: cur } = latest.current;
    const patientLabel = list.find((a) => a.id === id)?.patientLabel;
    const paidKind = state.kind ?? "FULL";
    const paid = state.amount ?? 0;
    notify.saved(patientLabel && cur ? PAYMENT_TEXT.registered(formatPrice(paid, cur), patientLabel) : "Pago registrado");
    done?.({ kind: paidKind, amount: paid });
  }, [state]);

  if (appointments.length === 0) {
    return <EmptyState title={PAYMENT_TEXT.noAppointments} />;
  }

  const selected = appointments.find((a) => a.id === appointmentId);

  return (
    <form action={action} className="grid gap-4">
      <Field label="Turno">
        <Select
          name="appointmentId"
          value={appointmentId}
          className="h-11"
          onChange={(e) => {
            const id = e.target.value;
            setAppointmentId(id);
            setAmount(defaultAmount(appointments.find((a) => a.id === id), kind));
          }}
        >
          {appointments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-2">
        <span aria-hidden className="text-subheadline font-medium">
          Tipo
        </span>
        <input type="hidden" name="kind" value={kind} />
        <SegmentedControl<Kind>
          value={kind}
          onValueChange={(next) => {
            setKind(next);
            setAmount(defaultAmount(selected, next));
          }}
          aria-label="Tipo de pago"
          size="lg"
          fullWidth
          options={[
            { value: "FULL", label: PAYMENT_TEXT.kind.FULL },
            { value: "DEPOSIT", label: PAYMENT_TEXT.kind.DEPOSIT },
          ]}
        />
      </div>
      <Field label={currency ? `Monto (${currency})` : "Monto"}>
        <Input
          type="number"
          name="amount"
          step="0.01"
          min="0"
          inputMode="decimal"
          required
          className="h-11 tabular-nums"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="submit" size="lg" loading={pending}>
          {pending ? "Guardando…" : "Registrar pago"}
        </Button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}
