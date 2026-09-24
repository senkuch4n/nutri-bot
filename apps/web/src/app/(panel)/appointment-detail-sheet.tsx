"use client";

import { useState, type RefObject } from "react";
import { es } from "date-fns/locale";
import { Bell, Check, Undo2, UserX } from "lucide-react";
import { formatInTimeZone, formatPrice } from "@nutri-bot/core";
import { Separator } from "@/components/primitives/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/primitives/sheet";
import { useConfirm } from "@/components/confirm";
import { Badge, Button, FormError } from "@/components/ui";
import { notify } from "@/lib/notify";
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

const statusBadge: Record<
  SelectedAppointment["status"],
  { tone: "info" | "success" | "danger"; label: string }
> = {
  CONFIRMED: { tone: "info", label: "Confirmado" },
  COMPLETED: { tone: "success", label: "Completado" },
  NO_SHOW: { tone: "danger", label: "No asistió" },
};

/**
 * Panel lateral **no modal** (reordenamiento 4): sin overlay, el calendario sigue usable y tocar
 * otro turno cambia el contenido sin cerrar. Conserva `role="dialog"`, título, Escape y la
 * devolución de foco al turno que lo abrió.
 */
export function AppointmentDetailSheet({
  appt,
  tz,
  currency,
  onClose,
  onChanged,
  interactionAreaRef,
  returnFocusRef,
}: {
  appt: SelectedAppointment | null;
  tz: string;
  currency: string;
  onClose: () => void;
  onChanged: () => void;
  interactionAreaRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  // El último turno mostrado se conserva mientras dura la animación de cierre (appt ya es null).
  const [shown, setShown] = useState(appt);
  if (appt && appt !== shown) setShown(appt);

  return (
    <Sheet
      open={appt !== null}
      modal={false}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-sm"
        onInteractOutside={(e) => {
          // Un clic dentro del calendario elige otro turno o una franja: no cierra el panel.
          if (interactionAreaRef?.current?.contains(e.target as Node)) e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          const el = returnFocusRef?.current;
          if (el?.isConnected) {
            e.preventDefault();
            el.focus();
          }
        }}
      >
        {shown ? (
          <AppointmentBody
            key={shown.id}
            appt={shown}
            tz={tz}
            currency={currency}
            onClose={onClose}
            onChanged={onChanged}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

type Busy = null | "reminder" | "completed" | "no_show" | "cancel" | "confirm";

function AppointmentBody({
  appt,
  tz,
  currency,
  onClose,
  onChanged,
}: {
  appt: SelectedAppointment;
  tz: string;
  currency: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  async function run(
    kind: Exclude<Busy, null | "reminder">,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) {
    setBusy(kind);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (res.ok) {
      notify.saved(success);
      onChanged();
      onClose();
    } else {
      setError(res.error ?? "No se pudo completar la acción.");
    }
  }

  async function sendReminder() {
    setBusy("reminder");
    setError(null);
    const res = await sendReminderNowAction(appt.id);
    setBusy(null);
    if (res.ok) notify.info("Recordatorio encolado.");
    else setError(res.error ?? "No se pudo encolar el recordatorio.");
  }

  const badge = statusBadge[appt.status];
  const disabled = busy !== null;
  const dateLabel = `${formatInTimeZone(new Date(appt.start), tz, "EEEE dd/MM/yyyy HH:mm", { locale: es })} hs`;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{appt.patientName ?? appt.patientPhone}</SheetTitle>
        <SheetDescription>{appt.serviceName}</SheetDescription>
      </SheetHeader>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone={badge.tone}>{badge.label}</Badge>
        {appt.googleSynced ? <Badge tone="neutral">En Google Calendar</Badge> : null}
      </div>

      <dl className="mt-6 grid grid-cols-[7rem_1fr] gap-y-3 text-sm">
        <dt className="text-muted-foreground">Paciente</dt>
        <dd className="font-medium">{appt.patientName ?? "—"}</dd>
        <dt className="text-muted-foreground">Teléfono</dt>
        <dd className="font-medium tabular-nums">{appt.patientPhone}</dd>
        <dt className="text-muted-foreground">Servicio</dt>
        <dd className="font-medium">{appt.serviceName}</dd>
        <dt className="text-muted-foreground">Fecha</dt>
        <dd className="font-medium capitalize">{dateLabel}</dd>
        <dt className="text-muted-foreground">Precio</dt>
        <dd className="font-medium tabular-nums">{formatPrice(appt.price, currency)}</dd>
      </dl>

      <Separator className="mt-6" />

      <div className="mt-6 space-y-2">
        {appt.status === "CONFIRMED" ? (
          <>
            <Button
              variant="secondary"
              className="w-full justify-start"
              disabled={disabled}
              loading={busy === "completed"}
              onClick={() =>
                run("completed", () => setStatusAction(appt.id, "COMPLETED"), "Turno marcado como completado")
              }
            >
              {busy === "completed" ? null : <Check aria-hidden />}
              Marcar completado
            </Button>
            <Button
              variant="secondary"
              className="w-full justify-start"
              disabled={disabled}
              loading={busy === "no_show"}
              onClick={() =>
                run("no_show", () => setStatusAction(appt.id, "NO_SHOW"), "Turno marcado como «No asistió»")
              }
            >
              {busy === "no_show" ? null : <UserX aria-hidden />}
              No asistió
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start"
              disabled={disabled}
              loading={busy === "reminder"}
              onClick={sendReminder}
            >
              {busy === "reminder" ? null : <Bell aria-hidden />}
              Enviar recordatorio ahora
            </Button>
            <Separator className="my-4" />
            <Button
              variant="danger"
              className="w-full"
              disabled={disabled}
              loading={busy === "cancel"}
              onClick={async () => {
                const ok = await confirm({
                  title: "¿Cancelar este turno?",
                  description: "El paciente recibe el aviso de cancelación por WhatsApp. No se puede deshacer.",
                  confirmLabel: "Cancelar turno",
                  cancelLabel: "Volver",
                });
                if (ok) run("cancel", () => cancelAppointmentAction(appt.id), "Turno cancelado");
              }}
            >
              Cancelar turno
            </Button>
            <p className="text-xs text-muted-foreground">El paciente recibe el aviso por WhatsApp.</p>
          </>
        ) : (
          <Button
            variant="secondary"
            className="w-full justify-start"
            disabled={disabled}
            loading={busy === "confirm"}
            onClick={() =>
              run("confirm", () => setStatusAction(appt.id, "CONFIRMED"), "Turno vuelto a confirmado")
            }
          >
            {busy === "confirm" ? null : <Undo2 aria-hidden />}
            Volver a confirmado
          </Button>
        )}
        <FormError message={error} />
      </div>
    </>
  );
}
