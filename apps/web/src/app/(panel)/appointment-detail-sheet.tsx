"use client";

import { useEffect, useState, useTransition, type RefObject } from "react";
import {
  Banknote,
  Bell,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronDown,
  CircleSlash,
  ClipboardList,
  Clock,
  Cloud,
  FileText,
  Loader2,
  MessageCircle,
  Phone,
  Trash2,
  User,
  UserX,
  type LucideIcon,
} from "lucide-react";
import {
  AGENDA_TEXT,
  APPOINTMENT_LIST_TEXT,
  APPOINTMENT_STATUS_TEXT,
  BOOKING_REASON_MAX,
  HIDDEN_NUMBER_TEXT,
  RESCHEDULE_TEXT,
  appointmentDayAtTime,
  appointmentDayTime,
  appointmentDurationMinutes,
  appointmentShortDate,
  capitalizeFirst,
  classifyWhatsappJid,
  formatInTimeZone,
  formatPhone,
  formatPrice,
  formatTime,
  isUnpaidDepositCancellation,
  whatsappChatUrl,
  type AppointmentStatusLike,
} from "@nutri-bot/core";
import { buttonVariants } from "@/components/primitives/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/primitives/sheet";
import { useConfirm } from "@/components/confirm";
import { RescheduleDialog } from "@/components/reschedule-dialog";
import { Badge, Button, ButtonLink, FormError, Textarea, cn, filledInputClass } from "@/components/ui";
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
  /** HU-021: también CANCELLED y AWAITING_PAYMENT (solo los abre /turnos, en modo lectura). */
  status: AppointmentStatusLike;
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
  /** HU-021 (opcionales; solo /turnos los manda): */
  cancelledBy?: "PATIENT" | "PROFESSIONAL" | null;
  cancelReason?: string | null;
  /** appointmentPaymentText: se muestra como fila "Pagos" del detalle. */
  paymentText?: string;
  /** D9: saldo (string numérico) para precargar "Registrar pago". */
  balance?: string;
  /** Seña configurada del servicio, para el tipo "Seña" del pago. */
  depositAmount?: string;
}

const T = AGENDA_TEXT.sheet;

const statusBadge: Record<
  AppointmentStatusLike,
  { tone: "info" | "success" | "danger" | "neutral" | "warning"; icon: LucideIcon; text: string }
> = {
  CONFIRMED: { tone: "info", icon: CalendarCheck, text: APPOINTMENT_STATUS_TEXT.CONFIRMED },
  COMPLETED: { tone: "success", icon: Check, text: APPOINTMENT_STATUS_TEXT.COMPLETED },
  NO_SHOW: { tone: "danger", icon: UserX, text: APPOINTMENT_STATUS_TEXT.NO_SHOW },
  // HU-021: solo los muestra el detalle en modo lectura de /turnos.
  CANCELLED: { tone: "neutral", icon: CircleSlash, text: APPOINTMENT_LIST_TEXT.status.cancelled },
  AWAITING_PAYMENT: { tone: "warning", icon: Clock, text: APPOINTMENT_LIST_TEXT.status.awaiting_deposit },
};

function StatusBadge({ status }: { status: AppointmentStatusLike }) {
  const badge = statusBadge[status];
  const BadgeIcon = badge.icon;
  return (
    <Badge tone={badge.tone}>
      <span className="inline-flex items-center gap-1">
        <BadgeIcon className="size-3.5" strokeWidth={2.25} aria-hidden />
        {badge.text}
      </span>
    </Badge>
  );
}

type AppointmentDetailBodyProps = {
  appt: SelectedAppointment;
  tz: string;
  currency: string;
  onClose: () => void;
  onChanged: () => void;
  onUpdated: (next: SelectedAppointment) => void;
  onCancel: (appt: SelectedAppointment) => void;
};

/** HU-021 (T14). Cuerpo del detalle, sin contenedor. Lo usan AppointmentDetailSheet (calendario) y
 *  AppointmentDetailDialog (/turnos). CANCELLED / AWAITING_PAYMENT → modo lectura. La rama se elige
 *  antes de cualquier hook (cada rama es un componente propio). */
export function AppointmentDetailBody(props: AppointmentDetailBodyProps) {
  if (props.appt.status === "CANCELLED" || props.appt.status === "AWAITING_PAYMENT") {
    return <ReadOnlyAppointmentBody appt={props.appt} tz={props.tz} currency={props.currency} />;
  }
  return <ActiveAppointmentBody {...props} />;
}

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
        className="w-full sm:max-w-sm [&_[data-appointment-header]]:pr-10"
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
      </SheetContent>
    </Sheet>
  );
}


// Diseño de la referencia (2026-10-31): secciones con etiqueta suave y filas con una línea debajo. Dos
// columnas cuando entran (diálogo); una sola en la hoja angosta.
const SECTIONS = "mt-6 grid gap-x-10 gap-y-7 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]";
const FIELD = "flex min-h-12 items-center gap-3 border-b border-black/[0.06] py-2.5 text-body";

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <h3 className="text-callout font-normal text-muted-foreground/80">{label}</h3>
      {children}
    </section>
  );
}

function Field({
  icon: Icon,
  action,
  className,
  as: Tag = "div",
  children,
}: {
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
  /** "span": la fila va adentro de un <button> (HU-022, "Fecha y hora" que abre "Cambiar horario"). */
  as?: "div" | "span";
  children: React.ReactNode;
}) {
  return (
    <Tag className={cn(FIELD, className)}>
      {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden /> : null}
      <Tag className="flex min-w-0 flex-1 items-center">{children}</Tag>
      {action ? <Tag className="shrink-0">{action}</Tag> : null}
    </Tag>
  );
}

/** HU-022 (S5): se reprograman los turnos confirmados o esperando la seña, si todavía no empezaron. */
function isReschedulable(status: AppointmentStatusLike, start: Date, now: Date): boolean {
  return (status === "CONFIRMED" || status === "AWAITING_PAYMENT") && start.getTime() > now.getTime();
}

/** Ícono de la barra superior (ficha, WhatsApp, cancelar) con su nombre en un tooltip. */
function HeaderAction({
  label,
  icon: Icon,
  href,
  external,
  disabled,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  href?: string;
  external?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const cls = cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-10 rounded-full text-muted-foreground");
  const icon = <Icon className="size-[1.125rem]" strokeWidth={2} aria-hidden />;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href && external ? (
          <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={cls}>
            {icon}
          </a>
        ) : href ? (
          <ButtonLink href={href} variant="ghost" size="icon" aria-label={label} className={cls}>
            {icon}
          </ButtonLink>
        ) : (
          <Button type="button" variant="ghost" size="icon" aria-label={label} disabled={disabled} onClick={onClick} className={cls}>
            {icon}
          </Button>
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** "Paciente:", el nombre (título del diálogo) y los chips de servicio, fecha y hora. */
function AppointmentHeading({ appt, tz, whenLabel }: { appt: SelectedAppointment; tz: string; whenLabel: string }) {
  const start = new Date(appt.start);
  return (
    <>
      <p className="mt-4 text-callout text-muted-foreground">{T.patient}</p>
      <SheetTitle
        data-appointment-title=""
        tabIndex={-1}
        className="mt-0.5 rounded-md text-title-1 font-semibold outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {appt.patientLabel}
      </SheetTitle>
      <SheetDescription className="sr-only">
        {appt.serviceName} · {capitalizeFirst(whenLabel)}
      </SheetDescription>
      <div className="mt-3 flex items-center gap-2 border-b border-black/[0.06] pb-4">
        <div aria-hidden className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {[appt.serviceName, appointmentShortDate(start, tz), formatTime(start, tz)].map((chip, i) => (
            <span key={i} className="rounded-lg bg-black/[0.04] px-2.5 py-1 text-callout tabular-nums">
              {chip}
            </span>
          ))}
        </div>
        {appt.googleSynced ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="grid size-8 place-items-center rounded-full text-muted-foreground">
                <Cloud className="size-[1.125rem]" strokeWidth={2} aria-hidden />
                <span className="sr-only">{T.inGoogle}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>{T.inGoogle}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </>
  );
}

type Busy = null | "reminder" | "completed" | "no_show" | "confirm";

function ActiveAppointmentBody({
  appt,
  tz,
  currency,
  onClose,
  onChanged,
  onUpdated,
  onCancel,
}: AppointmentDetailBodyProps) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  // HU-022: "Cambiar horario" crece desde la fila de "Fecha y hora" que se tocó.
  const [rescheduleOrigin, setRescheduleOrigin] = useState<HTMLElement | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
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

  const disabled = busy !== null || savingReason;
  const chatUrl = whatsappChatUrl({ whatsappJid: appt.patientJid, phone: appt.patientPhone });
  const phoneLine =
    classifyWhatsappJid(appt.patientJid) === "phone" ? formatPhone(appt.patientPhone) : HIDDEN_NUMBER_TEXT;
  const canPay = (appt.status === "CONFIRMED" || appt.status === "COMPLETED") && !appt.hasFullPayment;
  const whenLabel = appointmentDayTime(start, now, tz);
  const canReschedule = isReschedulable(appt.status, start, now);

  // Estado: las mismas transiciones que los botones de antes (confirmado → vino / no vino; y de vuelta).
  const statusOptions: AppointmentStatusLike[] =
    appt.status === "CONFIRMED" ? ["CONFIRMED", "COMPLETED", "NO_SHOW"] : [appt.status, "CONFIRMED"];
  function changeStatus(next: AppointmentStatusLike) {
    if (next === appt.status) return;
    if (next === "COMPLETED") markCompleted();
    else if (next === "NO_SHOW") run("no_show", () => setStatusAction(appt.id, "NO_SHOW"), T.toastNoShow);
    else if (next === "CONFIRMED") void backToConfirmed();
  }
  const statusBusy = busy === "completed" || busy === "no_show" || busy === "confirm";

  return (
    <>
      <div data-appointment-header="" className="flex min-h-10 items-center justify-end gap-1">
        <HeaderAction label={T.seeProfile} href={`/pacientes/${appt.patientId}`} icon={User} />
        {chatUrl ? (
          <HeaderAction label={`${T.whatsapp} (se abre en otra pestaña)`} href={chatUrl} external icon={MessageCircle} />
        ) : null}
        {appt.status === "CONFIRMED" ? (
          <HeaderAction label={T.cancel} icon={Trash2} disabled={disabled} onClick={cancelAppointment} />
        ) : null}
      </div>

      <AppointmentHeading appt={appt} tz={tz} whenLabel={whenLabel} />

      <div className={SECTIONS}>
        <Section label={T.sections.when}>
          {canReschedule ? (
            // HU-022 (S1): las mismas filas, tocables; abren "Cambiar horario" en su lugar.
            <button
              type="button"
              aria-label={RESCHEDULE_TEXT.openLabel(whenLabel)}
              disabled={disabled}
              onClick={(e) => {
                setRescheduleOrigin(e.currentTarget);
                setRescheduling(true);
              }}
              className="-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 text-left transition-colors duration-150 hover:bg-black/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:hover:bg-transparent motion-reduce:transition-none"
            >
              <WhenRows appt={appt} start={start} tz={tz} as="span" />
            </button>
          ) : (
            <WhenRows appt={appt} start={start} tz={tz} />
          )}
        </Section>

        <Section label={T.sections.status}>
          <div className="relative">
            <select
              aria-label={T.statusLabel}
              value={appt.status}
              disabled={disabled}
              onChange={(e) => changeStatus(e.target.value as AppointmentStatusLike)}
              className={cn(FIELD, "w-full cursor-pointer appearance-none bg-transparent pr-8 disabled:cursor-default")}
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {APPOINTMENT_STATUS_TEXT[s]}
                </option>
              ))}
            </select>
            {statusBusy ? (
              <Loader2 className="pointer-events-none absolute right-1 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
            ) : (
              <ChevronDown className="pointer-events-none absolute right-1 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            )}
          </div>
          {appt.status === "CONFIRMED" ? (
            <Field
              icon={Bell}
              action={
                isPast ? null : (
                  <Button variant="plain" size="sm" className="-mr-3" disabled={disabled} loading={busy === "reminder"} onClick={sendReminder}>
                    {T.sendReminderShort}
                  </Button>
                )
              }
            >
              <span aria-live="polite" className={cn("min-w-0", (isPast || remindersText === null) && "text-muted-foreground")}>
                <span className="sr-only">{T.reminders}: </span>
                {isPast ? T.pastAppointment : (remindersText ?? "…")}
              </span>
            </Field>
          ) : null}
          {appt.status === "COMPLETED" && appt.consultation ? (
            <Field
              icon={ClipboardList}
              action={
                <ButtonLink variant="plain" size="sm" className="-mr-3" href={`/pacientes/${appt.patientId}/consultas/${appt.consultation.id}`}>
                  {T.openConsultation}
                </ButtonLink>
              }
            >
              <span className="text-muted-foreground">{T.consultation}</span>
            </Field>
          ) : null}
        </Section>

        <Section label={T.sections.finance}>
          <Field action={<span className="font-medium tabular-nums">{formatPrice(appt.price, currency)}</span>}>
            <span className="min-w-0 truncate">{appt.serviceName}</span>
          </Field>
          <Field
            icon={Banknote}
            action={
              canPay ? (
                <Button variant="plain" size="sm" className="-mr-3" disabled={disabled} onClick={() => setPaying(true)}>
                  {T.registerPayment}
                </Button>
              ) : null
            }
          >
            <span className={cn("min-w-0", !appt.hasFullPayment && "text-muted-foreground")}>
              {appt.paymentText ?? (appt.hasFullPayment ? T.paid : AGENDA_TEXT.dayPanel.pendingPayment)}
            </span>
          </Field>
        </Section>

        <Section label={T.sections.more}>
          {editingReason ? (
            <form onSubmit={submitReason} className="space-y-2 pt-2">
              <label htmlFor={`motivo-${appt.id}`} className="sr-only">
                Motivo de consulta
              </label>
              <Textarea
                id={`motivo-${appt.id}`}
                rows={4}
                maxLength={BOOKING_REASON_MAX}
                className={`${filledInputClass} h-auto bg-background px-4 py-3`}
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
            <Field
              icon={FileText}
              action={
                <Button
                  type="button"
                  variant="plain"
                  size="sm"
                  className="-mr-3"
                  disabled={disabled}
                  aria-label={T.editReason}
                  onClick={() => {
                    setReasonDraft(appt.reason ?? "");
                    setReasonError(null);
                    setEditingReason(true);
                  }}
                >
                  {T.edit}
                </Button>
              }
            >
              <span className={cn("min-w-0 whitespace-pre-wrap break-words", !appt.reason && "text-muted-foreground")}>
                <span className="sr-only">{T.reason}: </span>
                {appt.reason ?? T.noReason}
              </span>
            </Field>
          )}
          <Field icon={Phone}>
            <span className="tabular-nums">
              <span className="sr-only">{T.phone}: </span>
              {phoneLine}
            </span>
          </Field>
        </Section>
      </div>

      <FormError message={error} />

      {canReschedule || rescheduling ? (
        <RescheduleDialog
          open={rescheduling}
          onOpenChange={setRescheduling}
          origin={rescheduleOrigin}
          appointmentId={appt.id}
          currentStart={appt.start}
          tz={tz}
          onDone={(next) => {
            notify.saved(RESCHEDULE_TEXT.toastDone);
            onUpdated({ ...appt, start: next.start, end: next.end });
            onChanged();
            setRemindersVersion((v) => v + 1);
          }}
        />
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
            // HU-021 (D9): desde /turnos llegan el saldo y la seña; desde el calendario, undefined.
            balanceAmount: appt.balance,
            depositAmount: appt.depositAmount,
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

/** "Fecha y hora": día, hora y duración. `as="span"` cuando van adentro del botón de "Cambiar horario". */
function WhenRows({ appt, start, tz, as }: { appt: SelectedAppointment; start: Date; tz: string; as?: "div" | "span" }) {
  const Row = as ?? "div";
  return (
    <>
      <Field icon={CalendarDays} as={as}>
        {appointmentShortDate(start, tz)}
      </Field>
      <Row className="flex gap-6">
        <Field icon={Clock} className="flex-1" as={as}>
          <span className="tabular-nums">{formatTime(start, tz)}</span>
        </Field>
        <Field className="flex-1" as={as}>
          <span className="tabular-nums">{T.minutes(appointmentDurationMinutes(appt.start, appt.end))}</span>
        </Field>
      </Row>
    </>
  );
}

/** HU-021 (D8). Turno CANCELLED o AWAITING_PAYMENT abierto desde /turnos: solo lectura, sin acciones de
 *  estado, recordatorio, motivo, cancelación ni "Registrar pago". */
function ReadOnlyAppointmentBody({
  appt,
  tz,
  currency,
}: {
  appt: SelectedAppointment;
  tz: string;
  currency: string;
}) {
  const L = APPOINTMENT_LIST_TEXT.readOnly;
  const whenLabel = appointmentDayTime(new Date(appt.start), new Date(), tz);
  const cancelledByText = isUnpaidDepositCancellation(appt.cancelReason)
    ? L.byDepositExpiry
    : appt.cancelledBy === "PATIENT"
      ? L.byPatient
      : appt.cancelledBy === "PROFESSIONAL"
        ? L.byProfessional
        : null;

  return (
    <>
      <div data-appointment-header="" className="flex min-h-10 items-center justify-end gap-1">
        <HeaderAction label={T.seeProfile} href={`/pacientes/${appt.patientId}`} icon={User} />
      </div>

      <AppointmentHeading appt={appt} tz={tz} whenLabel={whenLabel} />

      <div className={SECTIONS}>
        <Section label={T.sections.status}>
          <Field>
            <StatusBadge status={appt.status} />
          </Field>
          {appt.status === "CANCELLED" && cancelledByText ? <Field>{cancelledByText}</Field> : null}
          {appt.status === "CANCELLED" ? (
            <Field>
              <span className={cn("min-w-0 break-words", !appt.cancelReason && "text-muted-foreground")}>
                <span className="sr-only">{L.cancelReason}: </span>
                {appt.cancelReason ?? L.noCancelReason}
              </span>
            </Field>
          ) : null}
        </Section>

        <Section label={T.sections.finance}>
          <Field action={<span className="font-medium tabular-nums">{formatPrice(appt.price, currency)}</span>}>
            <span className="min-w-0 truncate">{appt.serviceName}</span>
          </Field>
          <Field icon={Banknote}>
            <span className="sr-only">{L.payments}: </span>
            {appt.paymentText ?? "—"}
          </Field>
        </Section>

        <Section label={T.sections.more}>
          <Field icon={FileText}>
            <span className={cn("min-w-0 whitespace-pre-wrap break-words", !appt.reason && "text-muted-foreground")}>
              <span className="sr-only">{T.reason}: </span>
              {appt.reason ?? T.noReason}
            </span>
          </Field>
        </Section>
      </div>
    </>
  );
}
