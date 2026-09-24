"use client";

import { useState, type RefObject } from "react";
import { es } from "date-fns/locale";
import { Bell, Check, ClipboardList, Undo2, UserX } from "lucide-react";
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
import { Badge, Button, ButtonLink, FormError } from "@/components/ui";
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
  patientId: string;
  /** Consulta del turno (HU-003). `hasContent`: tiene mediciones, plan o notas. */
  consultation: { id: string; hasContent: boolean } | null;
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
  onUpdated,
  interactionAreaRef,
  returnFocusRef,
}: {
  appt: SelectedAppointment | null;
  tz: string;
  currency: string;
  onClose: () => void;
  onChanged: () => void;
  /** Reemplaza el turno mostrado sin cerrar el panel (p. ej. después de "Marcar completado"). */
  onUpdated: (next: SelectedAppointment) => void;
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
            onUpdated={onUpdated}
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
  onUpdated,
}: {
  appt: SelectedAppointment;
  tz: string;
  currency: string;
  onClose: () => void;
  onChanged: () => void;
  onUpdated: (next: SelectedAppointment) => void;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  async function run<R extends { ok: boolean; error?: string }>(
    kind: Exclude<Busy, null | "reminder">,
    fn: () => Promise<R>,
    success: string | ((res: R) => string),
    options?: { keepOpen?: boolean; onSuccess?: (res: R) => void },
  ) {
    setBusy(kind);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (res.ok) {
      notify.saved(typeof success === "function" ? success(res) : success);
      onChanged();
      options?.onSuccess?.(res);
      if (!options?.keepOpen) onClose();
    } else {
      setError(res.error ?? "No se pudo completar la acción.");
    }
  }

  // "Marcar completado": el dominio crea (o reusa) la consulta; el panel queda abierto con "Abrir consulta".
  function markCompleted() {
    run(
      "completed",
      () => setStatusAction(appt.id, "COMPLETED"),
      (res) => (res.consultation?.created ? "Turno completado. Se creó su consulta." : "Turno completado."),
      {
        keepOpen: true,
        onSuccess: (res) =>
          onUpdated({
            ...appt,
            status: "COMPLETED",
            consultation: res.consultation
              ? {
                  id: res.consultation.id,
                  hasContent: res.consultation.created ? false : (appt.consultation?.hasContent ?? false),
                }
              : appt.consultation,
          }),
      },
    );
  }

  // D3: si la consulta tiene contenido se conserva, pero se avisa antes. La confirmación va en el
  // handler, fuera de toda transición (React 19). Sin contenido, no se pregunta.
  async function backToConfirmed() {
    if (appt.status === "COMPLETED" && appt.consultation?.hasContent) {
      const ok = await confirm({
        title: "¿Volver el turno a confirmado?",
        description: `La consulta del ${formatInTimeZone(new Date(appt.start), tz, "dd/MM")} tiene mediciones o notas y se conserva.`,
        confirmLabel: "Volver a confirmado",
        cancelLabel: "Cancelar",
        destructive: false,
      });
      if (!ok) return;
    }
    run("confirm", () => setStatusAction(appt.id, "CONFIRMED"), "Turno vuelto a confirmado");
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
              onClick={markCompleted}
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
          <>
            {appt.status === "COMPLETED" && appt.consultation ? (
              <ButtonLink
                variant="secondary"
                className="w-full justify-start"
                href={`/pacientes/${appt.patientId}/consultas/${appt.consultation.id}`}
              >
                <ClipboardList aria-hidden />
                Abrir consulta
              </ButtonLink>
            ) : null}
            <Button
              variant="secondary"
              className="w-full justify-start"
              disabled={disabled}
              loading={busy === "confirm"}
              onClick={backToConfirmed}
            >
              {busy === "confirm" ? null : <Undo2 aria-hidden />}
              Volver a confirmado
            </Button>
          </>
        )}
        <FormError message={error} />
      </div>
    </>
  );
}
