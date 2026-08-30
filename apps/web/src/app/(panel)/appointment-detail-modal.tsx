"use client";

import { useState } from "react";
import { formatInTimeZone, formatPrice } from "@nutri-bot/core";
import { Modal } from "@/components/modal";
import { Badge, Button } from "@/components/ui";
import { cancelAppointmentAction, sendReminderNowAction, setStatusAction } from "./actions";

export interface SelectedAppointment {
  id: string;
  start: string;
  end: string;
  status: "CONFIRMED" | "COMPLETED" | "NO_SHOW";
  patientName: string | null;
  patientPhone: string;
  serviceName: string;
  price: string;
  googleSynced: boolean;
}

const statusBadge: Record<SelectedAppointment["status"], { tone: "blue" | "green" | "red"; label: string }> = {
  CONFIRMED: { tone: "blue", label: "Confirmado" },
  COMPLETED: { tone: "green", label: "Completado" },
  NO_SHOW: { tone: "red", label: "No asistió" },
};

export function AppointmentDetailModal({
  appt,
  tz,
  currency,
  onClose,
  onChanged,
}: {
  appt: SelectedAppointment | null;
  tz: string;
  currency: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!appt) return null;

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (res.ok) {
      onChanged();
      onClose();
    } else {
      setError(res.error ?? "No se pudo completar la acción.");
    }
  }

  async function sendReminder() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await sendReminderNowAction(appt!.id);
    setBusy(false);
    if (res.ok) setNotice("Recordatorio encolado.");
    else setError(res.error ?? "No se pudo encolar el recordatorio.");
  }

  const badge = statusBadge[appt.status];

  return (
    <Modal open onClose={onClose} title="Turno">
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <Badge tone={badge.tone}>{badge.label}</Badge>
          {appt.googleSynced ? <Badge tone="green">En Google Calendar</Badge> : null}
        </div>
        <Row label="Paciente" value={appt.patientName ?? "—"} />
        <Row label="Teléfono" value={appt.patientPhone} />
        <Row label="Servicio" value={appt.serviceName} />
        <Row
          label="Fecha"
          value={`${formatInTimeZone(new Date(appt.start), tz, "EEEE dd/MM/yyyy HH:mm")} hs`}
        />
        <Row label="Precio" value={formatPrice(appt.price, currency)} />
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm text-green-600">{notice}</p> : null}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        {appt.status === "CONFIRMED" ? (
          <>
            <Button variant="ghost" disabled={busy} onClick={sendReminder}>
              Enviar recordatorio ahora
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => run(() => setStatusAction(appt.id, "COMPLETED"))}
            >
              Marcar completado
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => run(() => setStatusAction(appt.id, "NO_SHOW"))}
            >
              No asistió
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => run(() => cancelAppointmentAction(appt.id))}
            >
              Cancelar turno
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => run(() => setStatusAction(appt.id, "CONFIRMED"))}
          >
            Volver a confirmado
          </Button>
        )}
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-ink-faint">{label}</span>
      <span className="text-right font-medium capitalize">{value}</span>
    </div>
  );
}
