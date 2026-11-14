"use client";

import { useCallback } from "react";
import { AGENDA_TEXT, firstName } from "@nutri-bot/core";
import { useDeferredDelete } from "@/lib/deferred-delete";
import { cancelAppointmentAction } from "./actions";
import type { SelectedAppointment } from "./appointment-detail-sheet";

// HU-021 (T15). Cancelación de un turno con "Deshacer", compartida por el calendario y /turnos. La key
// es la misma en las dos pantallas: una cancelación pendiente se ve igual en las dos.

/** Key del "Deshacer" de la cancelación de un turno (la misma que usaba calendar-client). */
export function appointmentCancelKey(appointmentId: string): string {
  return `appointment-cancel:${appointmentId}`;
}

/** Agenda la cancelación con "Deshacer" de 8 s: deferredDelete con AGENDA_TEXT.cancel.*,
 *  commit = cancelAppointmentAction(appt.id), guardUnload: true. */
export function useScheduleAppointmentCancel(options?: {
  onCommitted?: () => void;
}): (appt: Pick<SelectedAppointment, "id" | "patientName">) => void {
  const deferredDelete = useDeferredDelete();
  const onCommitted = options?.onCommitted;
  return useCallback(
    (appt) => {
      deferredDelete({
        key: appointmentCancelKey(appt.id),
        message: AGENDA_TEXT.cancel.scheduled(firstName(appt.patientName)),
        undoneMessage: AGENDA_TEXT.cancel.undone,
        commit: () => cancelAppointmentAction(appt.id),
        guardUnload: true,
        errorMessage: AGENDA_TEXT.cancel.error,
        onCommitted,
      });
    },
    [deferredDelete, onCommitted],
  );
}
