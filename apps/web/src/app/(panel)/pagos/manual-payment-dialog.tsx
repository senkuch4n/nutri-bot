"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui";
import { ManualPaymentForm, type AppointmentOption } from "./manual-payment-form";

export function ManualPaymentDialog({ appointments }: { appointments: AppointmentOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        Registrar pago
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Registrar pago manual"
        description="Efectivo o transferencia, asociado a un turno confirmado de la última o la próxima semana."
      >
        <ManualPaymentForm appointments={appointments} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}
