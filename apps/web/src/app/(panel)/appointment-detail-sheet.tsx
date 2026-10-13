"use client";

import { useEffect, useState, useTransition, type RefObject } from "react";
import {
  Banknote,
  Bell,
  CalendarCheck,
  Check,
  ClipboardList,
  ExternalLink,
  MessageCircle,
  Pencil,
  Undo2,
  User,
  UserX,
  type LucideIcon,
} from "lucide-react";
import {
  AGENDA_TEXT,
  APPOINTMENT_STATUS_TEXT,
  BOOKING_REASON_MAX,
  HIDDEN_NUMBER_TEXT,
  appointmentDayAtTime,
  appointmentDayTime,
  capitalizeFirst,
  classifyWhatsappJid,
  formatInTimeZone,
  formatPhone,
  formatPrice,
  whatsappChatUrl,
} from "@nutri-bot/core";
import { buttonVariants } from "@/components/primitives/button";
import { Separator } from "@/components/primitives/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/primitives/sheet";
import { useConfirm } from "@/components/confirm";
import { Badge, Button, ButtonLink, FormError, Textarea, cn } from "@/components/ui";
import { notify } from "@/lib/notify";
import {
  getAppointmentRemindersAction,
  saveAppointmentReasonAction,
  sendReminderNowAction,
  setStatusAction,
} from "./actions";
import { AppointmentPaymentModal } from "./appointment-payment-modal";

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
  /** HU-013: motivo de consulta. */
  reason: string | null;
  /** HU-017b-1: JID de la paciente (para saber si WhatsApp muestra el número). */
  patientJid: string;
  /** HU-017b-1: patientDisplayName (nombre, teléfono con formato o "Sin nombre"). */
  patientLabel: string;
  /** HU-017b-1 (D9): ya tiene un pago total aprobado → no se ofrece "Registrar pago". */
  hasFullPayment: boolean;
}

const T = AGENDA_TEXT.sheet;

const statusBadge: Record<
  SelectedAppointment["status"],
  { tone: "info" | "success" | "danger"; icon: LucideIcon }
> = {
  CONFIRMED: { tone: "info", icon: CalendarCheck },
  COMPLETED: { tone: "success", icon: Check },
  NO_SHOW: { tone: "danger", icon: UserX },
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
  onCancel,
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
  /** HU-017b-1 (D5): "Cancelar turno" ya confirmado; lo agenda el calendario con "Deshacer". */
  onCancel: (appt: SelectedAppointment) => void;
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
        onOpenAutoFocus={(e) => {
          // HU-017b-2 (R1): el foco inicial va al título del panel (el nombre), no a "Editar motivo".
          const title = (e.target as HTMLElement | null)?.querySelector<HTMLElement>("[data-appointment-title]");
          if (title) {
            e.preventDefault();
            title.focus();
          }
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
            onCancel={onCancel}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}


type Busy = null | "reminder" | "completed" | "no_show" | "confirm";

function AppointmentBody({
  appt,
  tz,
  currency,
  onClose,
  onChanged,
  onUpdated,
  onCancel,
}: {
  appt: SelectedAppointment;
  tz: string;
  currency: string;
  onClose: () => void;
  onChanged: () => void;
  onUpdated: (next: SelectedAppointment) => void;
  onCancel: (appt: SelectedAppointment) => void;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const confirm = useConfirm();
  // HU-013 (D5): edición del motivo en línea.
  const [editingReason, setEditingReason] = useState(false);
  const [reasonDraft, setReasonDraft] = useState(appt.reason ?? "");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [savingReason, startSavingReason] = useTransition();
  // HU-014 (D8): línea de estado de los recordatorios (solo turnos confirmados).
  const [remindersText, setRemindersText] = useState<string | null>(null);
  const [remindersVersion, setRemindersVersion] = useState(0);
  // SDD §15 (HU-014): turno cuyo horario ya pasó → sin botón manual y "Turno pasado". El detalle solo
  // se renderiza en el cliente (al elegir un turno): leer el reloj acá no genera desajustes de hidratación.
  const now = new Date();
  const start = new Date(appt.start);
  const isPast = start.getTime() <= now.getTime();
  useEffect(() => {
    if (appt.status !== "CONFIRMED" || isPast) return;
    let alive = true;
    setRemindersText(null);
    getAppointmentRemindersAction(appt.id)
      .then((res) => {
        if (alive) setRemindersText(res.ok ? res.text : "—");
      })
      .catch(() => {
        if (alive) setRemindersText("—");
      });
    return () => {
      alive = false;
    };
  }, [appt.id, appt.status, isPast, remindersVersion]);

  // Patrón de ajustes/after-hours-form.tsx: onSubmit + preventDefault + startTransition.
  function submitReason(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setReasonError(null);
    startSavingReason(async () => {
      const res = await saveAppointmentReasonAction(appt.id, reasonDraft);
      if (res.ok) {
        notify.saved(T.toastReasonSaved);
        setEditingReason(false);
        onUpdated({ ...appt, reason: res.reason ?? null });
        onChanged();
      } else {
        setReasonError(res.error ?? "No se pudo guardar el motivo.");
      }
    });
  }

  function cancelReasonEdit() {
    setReasonDraft(appt.reason ?? "");
    setReasonError(null);
    setEditingReason(false);
  }

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

  // "Vino a la consulta": el dominio crea (o reusa) la consulta; el panel queda abierto con "Abrir la consulta".
  function markCompleted() {
    run(
      "completed",
      () => setStatusAction(appt.id, "COMPLETED"),
      (res) => (res.consultation?.created ? T.toastCompletedCreated : T.toastCompleted),
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

  // D3 (HU-003): si la consulta tiene contenido se conserva, pero se avisa antes. La confirmación va en
  // el handler, fuera de toda transición (React 19). Sin contenido, no se pregunta.
  async function backToConfirmed() {
    if (appt.status === "COMPLETED" && appt.consultation?.hasContent) {
      const ok = await confirm({
        title: T.backToConfirmedTitle,
        description: `La consulta del ${formatInTimeZone(start, tz, "dd/MM")} tiene mediciones o notas y se conserva.`,
        confirmLabel: T.backToConfirmed,
        cancelLabel: "Cancelar",
        destructive: false,
      });
      if (!ok) return;
    }
    run("confirm", () => setStatusAction(appt.id, "CONFIRMED"), T.toastBackToConfirmed);
  }

  async function sendReminder() {
    setBusy("reminder");
    setError(null);
    const res = await sendReminderNowAction(appt.id);
    setBusy(null);
    if (res.ok && res.result === "already_pending") {
      notify.info(T.toastReminderPending);
    } else if (res.ok) {
      notify.info(T.toastReminderQueued);
      setRemindersVersion((v) => v + 1);
    } else setError(res.error ?? "No se pudo encolar el recordatorio.");
  }

  // D5/D6: confirmación (foco en "Volver") → el panel se cierra y el calendario agenda la cancelación
  // con "Deshacer" de 8 s. Nada sale hasta que vence el plazo.
  async function cancelAppointment() {
    const ok = await confirm({
      title: AGENDA_TEXT.cancel.title(appt.patientLabel),
      description: AGENDA_TEXT.cancel.description(appointmentDayAtTime(start, now, tz)),
      confirmLabel: AGENDA_TEXT.cancel.confirm,
      cancelLabel: AGENDA_TEXT.cancel.back,
    });
    if (!ok) return;
    onClose();
    onCancel(appt);
  }

  const badge = statusBadge[appt.status];
  const BadgeIcon = badge.icon;
  const disabled = busy !== null || savingReason;
  const chatUrl = whatsappChatUrl({ whatsappJid: appt.patientJid, phone: appt.patientPhone });
  const phoneLine =
    classifyWhatsappJid(appt.patientJid) === "phone" ? formatPhone(appt.patientPhone) : HIDDEN_NUMBER_TEXT;
  const canPay = (appt.status === "CONFIRMED" || appt.status === "COMPLETED") && !appt.hasFullPayment;
  const whenLabel = appointmentDayTime(start, now, tz);

  const payButton = canPay ? (
    <Button variant="secondary" disabled={disabled} onClick={() => setPaying(true)}>
      <Banknote aria-hidden />
      {T.registerPayment}
    </Button>
  ) : null;

  return (
    <>
      <SheetHeader>
        <SheetTitle
          data-appointment-title=""
          tabIndex={-1}
          className="rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {appt.patientLabel}
        </SheetTitle>
        <SheetDescription>
          {appt.serviceName} · {capitalizeFirst(whenLabel)}
        </SheetDescription>
      </SheetHeader>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone={badge.tone}>
          <span className="inline-flex items-center gap-1">
            <BadgeIcon className="size-3.5" strokeWidth={2.25} aria-hidden />
            {APPOINTMENT_STATUS_TEXT[appt.status]}
          </span>
        </Badge>
        {appt.googleSynced ? <span className="text-footnote text-muted-foreground">{T.inGoogle}</span> : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <ButtonLink variant="secondary" href={`/pacientes/${appt.patientId}`}>
          <User aria-hidden />
          {T.seeProfile}
        </ButtonLink>
        {chatUrl ? (
          <a
            href={chatUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "secondary" })}
          >
            <MessageCircle aria-hidden />
            {T.whatsapp}
            <ExternalLink className="!size-3.5 text-muted-foreground" aria-hidden />
            <span className="sr-only">(se abre en otra pestaña)</span>
          </a>
        ) : null}
      </div>
      <p className="mt-2 text-footnote tabular-nums text-muted-foreground">{phoneLine}</p>

      <dl className="mt-5 grid grid-cols-[7rem_1fr] gap-y-3 text-callout">
        <dt className="text-muted-foreground">{T.price}</dt>
        <dd className="font-medium tabular-nums">{formatPrice(appt.price, currency)}</dd>
        <dt className="text-muted-foreground">{T.reason}</dt>
        <dd className="min-w-0">
          {editingReason ? (
            <form onSubmit={submitReason} className="space-y-2">
              <label htmlFor={`motivo-${appt.id}`} className="sr-only">
                Motivo de consulta
              </label>
              <Textarea
                id={`motivo-${appt.id}`}
                rows={4}
                maxLength={BOOKING_REASON_MAX}
                autoFocus
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
                aria-describedby={`motivo-${appt.id}-contador`}
              />
              <p
                id={`motivo-${appt.id}-contador`}
                className="text-right text-footnote tabular-nums text-muted-foreground"
                aria-live="polite"
              >
                {reasonDraft.length}/{BOOKING_REASON_MAX}
              </p>
              <FormError message={reasonError} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" disabled={savingReason} onClick={cancelReasonEdit}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" loading={savingReason}>
                  {savingReason ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-1">
              <p
                className={cn(
                  "whitespace-pre-wrap break-words",
                  appt.reason ? "font-medium" : "text-muted-foreground",
                )}
              >
                {appt.reason ?? T.noReason}
              </p>
              <Button
                type="button"
                variant="plain"
                size="sm"
                className="-ml-3"
                disabled={disabled}
                onClick={() => {
                  setReasonDraft(appt.reason ?? "");
                  setReasonError(null);
                  setEditingReason(true);
                }}
              >
                <Pencil aria-hidden />
                {T.editReason}
              </Button>
            </div>
          )}
        </dd>

        {appt.status === "CONFIRMED" ? (
          <>
            <dt className="text-muted-foreground">{T.reminders}</dt>
            <dd aria-live="polite">
              {isPast ? (
                <span className="text-muted-foreground">{T.pastAppointment}</span>
              ) : remindersText === null ? (
                <span className="text-muted-foreground">…</span>
              ) : (
                remindersText
              )}
            </dd>
          </>
        ) : null}
      </dl>

      <div className="mt-6 space-y-3">
        {appt.status === "CONFIRMED" ? (
          <>
            <Button
              size="lg"
              className="w-full"
              disabled={disabled}
              loading={busy === "completed"}
              onClick={markCompleted}
            >
              {busy === "completed" ? null : <Check aria-hidden />}
              {T.completed}
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={disabled}
                loading={busy === "no_show"}
                onClick={() => run("no_show", () => setStatusAction(appt.id, "NO_SHOW"), T.toastNoShow)}
              >
                {busy === "no_show" ? null : <UserX aria-hidden />}
                {T.noShow}
              </Button>
              {isPast ? null : (
                <Button
                  variant="secondary"
                  disabled={disabled}
                  loading={busy === "reminder"}
                  onClick={sendReminder}
                >
                  {busy === "reminder" ? null : <Bell aria-hidden />}
                  {T.sendReminder}
                </Button>
              )}
              {payButton}
            </div>
          </>
        ) : (
          <>
            {appt.status === "COMPLETED" && appt.consultation ? (
              <ButtonLink
                size="lg"
                className="w-full"
                href={`/pacientes/${appt.patientId}/consultas/${appt.consultation.id}`}
              >
                <ClipboardList aria-hidden />
                {T.openConsultation}
              </ButtonLink>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={disabled}
                loading={busy === "confirm"}
                onClick={backToConfirmed}
              >
                {busy === "confirm" ? null : <Undo2 aria-hidden />}
                {T.backToConfirmed}
              </Button>
              {payButton}
            </div>
          </>
        )}
        <FormError message={error} />
      </div>

      {appt.status === "CONFIRMED" ? (
        <>
          <Separator className="my-6" />
          <Button
            variant="ghost"
            className="-ml-4 text-destructive"
            disabled={disabled}
            onClick={cancelAppointment}
          >
            {T.cancel}
          </Button>
          <p className="mt-1 text-footnote text-muted-foreground">{T.cancelHint}</p>
        </>
      ) : null}

      {canPay ? (
        <AppointmentPaymentModal
          open={paying}
          onClose={() => setPaying(false)}
          currency={currency}
          appointment={{
            id: appt.id,
            label: `${appt.patientLabel} · ${appt.serviceName} · ${whenLabel}`,
            priceSnapshot: appt.price,
            patientLabel: appt.patientLabel,
          }}
          onDone={(r) => {
            setPaying(false);
            onChanged();
            if (r.kind === "FULL") onUpdated({ ...appt, hasFullPayment: true });
          }}
        />
      ) : null}
    </>
  );
}
