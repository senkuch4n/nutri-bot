"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/primitives/dialog";

/**
 * Modal de compatibilidad (API conservada) sobre Dialog de Radix: foco atrapado, devolución
 * de foco al disparador y bloqueo del scroll del body. Escape y el clic afuera siguen cerrando.
 * Con `description`, Radix enlaza la descripción por `aria-describedby`; sin ella, se omite.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  description,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  description?: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      {/* Sin description, `aria-describedby={undefined}` le dice a Radix que no hay descripción
          (evita el aviso en consola). Con description, no se pasa: Radix enlaza la suya. */}
      <DialogContent
        className="max-h-[90vh] max-w-lg overflow-y-auto"
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
