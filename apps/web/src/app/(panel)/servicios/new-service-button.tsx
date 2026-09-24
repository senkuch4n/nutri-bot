"use client";

import { useState, type ComponentProps } from "react";
import { Plus } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/primitives/sheet";
import { Button } from "@/components/ui";
import { ServiceForm } from "./service-form";

export function NewServiceButton({
  label = "Nuevo servicio",
  variant = "primary",
}: {
  label?: string;
  variant?: ComponentProps<typeof Button>["variant"];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        {label}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Nuevo servicio</SheetTitle>
            <SheetDescription>El bot lo ofrece a los pacientes por WhatsApp.</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <ServiceForm onDone={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
