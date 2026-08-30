"use client";

import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui";
import { Modal } from "@/components/modal";
import { ServiceForm } from "./service-form";

export function NewServiceButton({
  label = "+ Nuevo servicio",
  variant = "primary",
}: {
  label?: string;
  variant?: ComponentProps<typeof Button>["variant"];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo servicio">
        <ServiceForm onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}
