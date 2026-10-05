"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui";
import { ManualPaymentForm, type AppointmentOption } from "./manual-payment-form";

export function ManualPaymentDialog({ appointments, currency }: { appointments: AppointmentOption[]; currency?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        Registrar pago
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Registrar pago"
        description="Efectivo o transferencia, de un turno de la última semana o de la próxima."
      >
        {open ? (
          <ManualPaymentForm appointments={appointments} currency={currency} onDone={() => setOpen(false)} />
        ) : null}
      </Modal>
    </>
  );
}
