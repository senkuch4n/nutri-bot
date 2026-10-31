"use client";

import { useState } from "react";
import { MorphDialog, MorphDialogContent } from "@/components/primitives/morph-dialog";
import { AppointmentDetailBody, type SelectedAppointment } from "../appointment-detail-sheet";

/**
 * HU-021 (SDD 7.6, T14). Detalle del turno abierto desde /turnos: el mismo cuerpo del calendario dentro
 * de un MorphDialog que crece desde "Abrir" (o desde la fila del celular) y le devuelve el foco al
 * cerrar. Turnos CANCELLED / AWAITING_PAYMENT → modo lectura (lo decide AppointmentDetailBody).
 */
export function AppointmentDetailDialog({
  appt,
  origin,
  tz,
  currency,
  onClose,
  onChanged,
  onUpdated,
  onCancel,
  anchored = false,
}: {
  appt: SelectedAppointment | null;
  origin: HTMLElement | null;
  /** Calendario: el turno se transforma en el diálogo, en su lugar (sin ir al centro). */
  anchored?: boolean;
  tz: string;
  currency: string;
  onClose: () => void;
  onChanged: () => void;
  onUpdated: (next: SelectedAppointment) => void;
  onCancel: (appt: SelectedAppointment) => void;
}) {
  // El último turno mostrado se conserva mientras dura la animación de salida (appt ya es null).
  const [shown, setShown] = useState(appt);
  if (appt && appt !== shown) setShown(appt);

  return (
    <MorphDialog
      open={appt !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      origin={origin}
    >
      <MorphDialogContent
        // Fondo claro y ✕ a la izquierda; la barra de íconos del cuerpo le deja lugar (pl-14). Ancho para las
        // dos columnas del detalle (Fecha y hora · Estado / Finanzas · Más).
        className="w-[min(100%,46rem)] bg-[#f9f8fa] [&_[data-appointment-header]]:pl-14"
        closeSide="left"
        anchor={anchored ? "origin" : "center"}
        onOpenAutoFocus={(e) => {
          // Igual que el Sheet del calendario: el foco inicial va al nombre, no a "Editar motivo".
          const title = (e.target as HTMLElement | null)?.querySelector<HTMLElement>("[data-appointment-title]");
          if (title) {
            e.preventDefault();
            title.focus();
          }
        }}
      >
        {shown ? (
          <AppointmentDetailBody
            key={shown.id}
            appt={shown}
            tz={tz}
            currency={currency}
            onClose={onClose}
            onChanged={onChanged}
            onUpdated={onUpdated}
            onCancel={onCancel}
          />
        ) : null}
      </MorphDialogContent>
    </MorphDialog>
  );
}
