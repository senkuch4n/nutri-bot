"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MorphDialog, MorphDialogContent } from "@/components/primitives/morph-dialog";
import { MORPH_LIFT_CLOSE_MS } from "@/lib/morph";
import { takePatientModalOrigin } from "@/lib/patient-modal-origin";
import { PatientModalPreviewContext } from "./patient-modal-skeleton";

/** La ficha abierta desde la lista: MorphDialog que crece desde la tarjeta tocada. Cerrar (Escape, la
 *  X, tocar afuera) anima la vuelta y recién después hace `router.back()`, que vuelve a `/pacientes`.
 *  Como en el video de referencia: la fila se levanta (`lift`), las iniciales, el nombre y la etapa
 *  viajan al encabezado (`data-morph-id`) y el cuerpo aparece de arriba hacia abajo (`cascade`).
 *  "Atrás" del navegador desmonta el slot directo: Radix y el MorphDialog limpian solos el origen. */
export function PatientRecordModal({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [{ origin, preview }] = useState(takePatientModalOrigin);
  const backTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (backTimer.current !== null) window.clearTimeout(backTimer.current);
    },
    [],
  );

  return (
    <MorphDialog
      open={open}
      origin={origin}
      lift
      cascade
      onOpenChange={(next) => {
        if (next || !open) return;
        setOpen(false);
        backTimer.current = window.setTimeout(() => router.back(), MORPH_LIFT_CLOSE_MS);
      }}
    >
      <MorphDialogContent size="xl" aria-describedby={undefined} className="max-sm:h-[85dvh]">
        <PatientModalPreviewContext.Provider value={preview}>{children}</PatientModalPreviewContext.Provider>
      </MorphDialogContent>
    </MorphDialog>
  );
}
