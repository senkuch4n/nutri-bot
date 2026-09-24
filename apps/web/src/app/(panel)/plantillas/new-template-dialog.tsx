"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui";
import { NewTemplateForm } from "./new-template-form";

export function NewTemplateDialog({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        Nueva plantilla
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nueva plantilla"
        description="Ponele un nombre; las comidas se cargan en el paso siguiente."
      >
        <NewTemplateForm onCancel={() => setOpen(false)} />
      </Modal>
    </>
  );
}
