"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { ServiceSheet } from "./service-form";

export function NewServiceButton({
  currency,
  mercadoPagoReady,
  label = "Nuevo servicio",
  variant = "primary",
}: {
  currency: string;
  /** HU-023: hay una cuenta de Mercado Pago conectada (si no, nota bajo "Pide seña"). */
  mercadoPagoReady: boolean;
  label?: string;
  variant?: "primary" | "tinted";
}) {
  const [open, setOpen] = useState(false);
  // El diálogo nace en el lugar del botón.
  const [origin, setOrigin] = useState<HTMLElement | null>(null);
  return (
    <>
      <Button
        variant={variant}
        onClick={(e) => {
          setOrigin(e.currentTarget);
          setOpen(true);
        }}
        className="rounded-full"
      >
        <Plus aria-hidden />
        {label}
      </Button>
      <ServiceSheet
        open={open}
        onOpenChange={setOpen}
        origin={origin}
        currency={currency}
        mercadoPagoReady={mercadoPagoReady}
        title="Nuevo servicio"
        description="El bot lo ofrece a los pacientes por WhatsApp."
      />
    </>
  );
}
