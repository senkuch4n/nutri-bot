"use client";

import {
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  BanknoteX,
  Check,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleSlash,
  CircleX,
  Clock,
  Coins,
  UserX,
  type LucideIcon,
} from "lucide-react";
import {
  APPOINTMENT_LIST_TEXT,
  type AppointmentListRow,
  type AppointmentPaymentState,
  type AppointmentRowStatus,
} from "@nutri-bot/core";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/primitives/table";
import { Badge, Button, cn } from "@/components/ui";
import { AppointmentReasonCell } from "../pacientes/[id]/appointment-reason-cell";

const T = APPOINTMENT_LIST_TEXT;

/** HU-021 V1 (referencia visual). Ícono de cada estado: las pastillas son neutras, así que el ícono y el
 *  texto son los que distinguen el estado (el color nunca es el indicador). */
export const ROW_STATUS_ICON: Record<AppointmentRowStatus, LucideIcon> = {
  upcoming: Circle,
  unclosed: CircleAlert,
  completed: CircleCheck,
  no_show: CircleX,
  cancelled: CircleSlash,
  deposit_unpaid: CircleSlash,
  awaiting_deposit: Clock,
};

/** Ícono de lo registrado como pagado. "free" ("—") va sin pastilla. */
const PAYMENT_ICON: Record<Exclude<AppointmentPaymentState, "free">, LucideIcon> = {
  paid: BadgeCheck,
  partial: Coins,
  none: BanknoteX,
};

/** Pastilla neutra con borde fino (Estado y Pago, tabla y celular). */
const pillClass =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-background px-2.5 py-0.5 text-footnote text-foreground more-contrast:border-input";

/** Acción de la fila con aspecto de texto gris («Abrir ↗», «Vino», «Registrar pago»). */
const textActionClass = "px-2 font-normal text-muted-foreground hover:text-foreground";

/** Id del botón "Abrir" de la fila: al cerrar el detalle o marcar "Vino", el foco vuelve ahí. */
export function openButtonId(appointmentId: string): string {
  return `turno-abrir-${appointmentId}`;
}

export function StatusPill({ row }: { row: AppointmentListRow }) {
  const Icon = ROW_STATUS_ICON[row.rowStatus];
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className={pillClass}>
        <Icon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
        {row.statusLabel}
      </span>
      {row.statusNote ? <span className="text-footnote text-muted-foreground">{row.statusNote}</span> : null}
    </span>
  );
}

/** R8: neutra, sin tonos de advertencia. "—" (sin cargo) va sin pastilla. */
export function PaymentPill({ row }: { row: AppointmentListRow }) {
  if (row.payment.state === "free") return <span className="text-muted-foreground">{row.paymentText}</span>;
  const Icon = PAYMENT_ICON[row.payment.state];
  return (
    <span className={pillClass}>
      <Icon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
      {row.paymentText}
    </span>
  );
}

export interface AppointmentRowActions {
  /** Fila con una acción en curso: sus botones quedan deshabilitados. */
  busy: { id: string; status: "COMPLETED" | "NO_SHOW" } | null;
  onOpen: (id: string, origin: HTMLElement) => void;
  onCloseAppointment: (row: AppointmentListRow, status: "COMPLETED" | "NO_SHOW") => void;
  onRegisterPayment: (row: AppointmentListRow) => void;
}

/** HU-021 V1. Tabla de escritorio (≥ 640 px), plana sobre el fondo de la página. La fila no es
 *  clickeable; "Abrir" sí. */
export function AppointmentsTable({
  rows,
  caption,
  actions,
}: {
  rows: AppointmentListRow[];
  /** tableCaption(monthTitle). */
  caption: string;
  /** Sin acciones, la columna queda vacía. */
  actions?: AppointmentRowActions;
}) {
  const head = "h-10 font-normal";
  return (
    <Table>
      <caption className="sr-only">{caption}</caption>
      <TableHeader className="bg-background [&_tr]:border-border/60">
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(head, "pl-0")}>{T.columns.status}</TableHead>
          <TableHead className={head}>{T.columns.patient}</TableHead>
          <TableHead className={head}>{T.columns.date}</TableHead>
          <TableHead className={head}>{T.columns.time}</TableHead>
          <TableHead className={head}>{T.columns.price}</TableHead>
          <TableHead className={head}>{T.columns.payment}</TableHead>
          <TableHead className={head}>{T.columns.reason}</TableHead>
          <TableHead className={cn(head, "pr-0")}>
            <span className="sr-only">{T.columns.actions}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="[&_tr:last-child]:border-b">
        {rows.map((row) => {
          const busy = actions?.busy?.id === row.id;
          const disabled = actions?.busy != null;
          return (
            <TableRow key={row.id} className="border-border/60 hover:bg-transparent">
              <TableCell className="h-16 py-3 pl-0">
                <StatusPill row={row} />
              </TableCell>
              <TableCell className="py-3">
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span>{row.patientLabel}</span>
                  {row.patientArchived ? <Badge tone="neutral">{T.archived}</Badge> : null}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap py-3 tabular-nums">{row.dateLabel}</TableCell>
              <TableCell className="whitespace-nowrap py-3 tabular-nums">{row.timeLabel}</TableCell>
              <TableCell
                className={cn("whitespace-nowrap py-3 tabular-nums", row.payment.state === "free" && "text-muted-foreground")}
              >
                {row.priceLabel}
              </TableCell>
              <TableCell className="py-3">
                <PaymentPill row={row} />
              </TableCell>
              <TableCell className="max-w-[14rem] py-3">
                <AppointmentReasonCell reason={row.reason} />
              </TableCell>
              <TableCell className="py-3 pr-0">
                {actions ? (
                  <div className="flex items-center justify-end gap-0.5">
                    {row.canClose ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={textActionClass}
                          disabled={disabled}
                          loading={busy && actions.busy?.status === "COMPLETED"}
                          aria-label={T.actions.attendedLabel(row.patientLabel)}
                          onClick={() => actions.onCloseAppointment(row, "COMPLETED")}
                        >
                          {busy && actions.busy?.status === "COMPLETED" ? null : <Check aria-hidden />}
                          {T.actions.attended}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={textActionClass}
                          disabled={disabled}
                          loading={busy && actions.busy?.status === "NO_SHOW"}
                          aria-label={T.actions.noShowLabel(row.patientLabel)}
                          onClick={() => actions.onCloseAppointment(row, "NO_SHOW")}
                        >
                          {busy && actions.busy?.status === "NO_SHOW" ? null : <UserX aria-hidden />}
                          {T.actions.noShow}
                        </Button>
                      </>
                    ) : null}
                    {row.canRegisterPayment ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className={textActionClass}
                        disabled={disabled}
                        aria-label={T.actions.registerPaymentLabel(row.patientLabel)}
                        onClick={() => actions.onRegisterPayment(row)}
                      >
                        <Banknote aria-hidden />
                        {T.actions.registerPayment}
                      </Button>
                    ) : null}
                    <Button
                      id={openButtonId(row.id)}
                      variant="ghost"
                      size="sm"
                      className={textActionClass}
                      aria-label={T.actions.openLabel(row.patientLabel, row.dateLabel, row.timeLabel)}
                      onClick={(e) => actions.onOpen(row.id, e.currentTarget)}
                    >
                      {T.actions.open}
                      <ArrowUpRight aria-hidden />
                    </Button>
                  </div>
                ) : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
