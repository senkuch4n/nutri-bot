"use client";

import { AGENDA_TEXT } from "@nutri-bot/core";
import { Modal } from "@/components/modal";
import { ManualPaymentForm, type AppointmentOption } from "./pagos/manual-payment-form";

/**
 * "Registrar pago" desde el panel del turno (HU-017b-1, D9/Q12): el turno ya elegido y el monto
 * precargado con su precio. Se renderiza dentro del panel (mismo árbol de React), así interactuar con
 * el modal no cuenta como un clic afuera del panel.
 */
export function AppointmentPaymentModal({
  open,
  onClose,
  appointment,
  currency,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  appointment: AppointmentOption;
  currency: string;
  onDone: (r: { kind: "DEPOSIT" | "FULL"; amount: number }) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={AGENDA_TEXT.sheet.registerPayment}>
      {open ? (
        <ManualPaymentForm
          appointments={[appointment]}
          defaultAppointmentId={appointment.id}
          currency={currency}
          onDone={onDone}
        />
      ) : null}
    </Modal>
  );
}
