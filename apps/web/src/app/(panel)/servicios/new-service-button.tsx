"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { ServiceSheet } from "./service-form";

export function NewServiceButton({
  currency,
  label = "Nuevo servicio",
  variant = "primary",
}: {
  currency: string;
  label?: string;
  variant?: "primary" | "tinted";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={variant === "primary" ? "lg" : "md"} onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        {label}
      </Button>
      <ServiceSheet
        open={open}
        onOpenChange={setOpen}
        currency={currency}
        title="Nuevo servicio"
        description="El bot lo ofrece a los pacientes por WhatsApp."
      />
    </>
  );
}
