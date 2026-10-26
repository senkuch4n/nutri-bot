"use client";

import {
  ArrowUpRight,
  Banknote,
  CalendarCheck,
  CalendarClock,
  Check,
  CircleCheck,
  CircleSlash,
  Clock,
  UserX,
  type LucideIcon,
} from "lucide-react";
import { APPOINTMENT_LIST_TEXT, type AppointmentListRow, type AppointmentRowStatus } from "@nutri-bot/core";
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

/** HU-021 (SDD 7.3). Ícono y colores de cada estado: el color nunca es el único indicador. `pill` = pastilla
 *  suave de la tabla; `text` = texto con color de la lista del celular. */
export const ROW_STATUS_VISUAL: Record<AppointmentRowStatus, { icon: LucideIcon; pill: string; text: string }> = {
  upcoming: { icon: CalendarCheck, pill: "bg-info-muted text-info", text: "text-info" },
  unclosed: { icon: CalendarClock, pill: "bg-warning-muted text-warning", text: "text-warning" },
  completed: { icon: CircleCheck, pill: "bg-success-muted text-success", text: "text-success" },
  no_show: { icon: UserX, pill: "bg-destructive-muted text-destructive", text: "text-destructive" },
  cancelled: { icon: CircleSlash, pill: "bg-secondary text-muted-foreground", text: "text-muted-foreground" },
  deposit_unpaid: { icon: CircleSlash, pill: "bg-secondary text-muted-foreground", text: "text-muted-foreground" },
  awaiting_deposit: { icon: Clock, pill: "bg-warning-muted text-warning", text: "text-warning" },
};

/** Id del botón "Abrir" de la fila: al cerrar el detalle o marcar "Vino", el foco vuelve ahí. */
export function openButtonId(appointmentId: string): string {
  return `turno-abrir-${appointmentId}`;
}

function StatusPill({ row }: { row: AppointmentListRow }) {
  const visual = ROW_STATUS_VISUAL[row.rowStatus];
  const Icon = visual.icon;
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-footnote font-semibold more-contrast:border more-contrast:border-current",
          visual.pill,
        )}
      >
        <Icon className="size-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
        {row.statusLabel}
      </span>
      {row.statusNote ? <span className="text-footnote text-muted-foreground">{row.statusNote}</span> : null}
    </div>
  );
}

/** R8: texto neutro, sin tonos de advertencia. "—" (sin cargo) va sin pastilla. */
function PaymentPill({ row }: { row: AppointmentListRow }) {
  if (row.payment.state === "free") return <span className="text-muted-foreground">{row.paymentText}</span>;
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full bg-secondary px-2.5 py-0.5 text-footnote font-medium more-contrast:border more-contrast:border-input",
        row.payment.state === "none" ? "text-muted-foreground" : "text-foreground",
      )}
    >
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

/** HU-021 (SDD 7.3). Tabla de escritorio (≥ 640 px). La fila no es clickeable; "Abrir" sí. */
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
  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-card more-contrast:border more-contrast:border-input">
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader className="bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">{T.columns.status}</TableHead>
            <TableHead>{T.columns.patient}</TableHead>
            <TableHead>{T.columns.service}</TableHead>
            <TableHead>{T.columns.date}</TableHead>
            <TableHead>{T.columns.time}</TableHead>
            <TableHead numeric>{T.columns.price}</TableHead>
            <TableHead>{T.columns.payment}</TableHead>
            <TableHead>{T.columns.reason}</TableHead>
            <TableHead className="pr-4">
              <span className="sr-only">{T.columns.actions}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const busy = actions?.busy?.id === row.id;
            const disabled = actions?.busy != null;
            return (
              <TableRow key={row.id}>
                <TableCell className="pl-4">
                  <StatusPill row={row} />
                </TableCell>
                <TableCell>
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span className="font-medium">{row.patientLabel}</span>
                    {row.patientArchived ? <Badge tone="neutral">{T.archived}</Badge> : null}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{row.serviceName}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{row.dateLabel}</TableCell>
                <TableCell className="tabular-nums">{row.timeLabel}</TableCell>
                <TableCell numeric className={cn("whitespace-nowrap", row.payment.state === "free" && "text-muted-foreground")}>
                  {row.priceLabel}
                </TableCell>
                <TableCell>
                  <PaymentPill row={row} />
                </TableCell>
                <TableCell className="max-w-[14rem]">
                  <AppointmentReasonCell reason={row.reason} />
                </TableCell>
                <TableCell className="pr-4">
                  {actions ? (
                    <div className="flex items-center justify-end gap-1">
                      {row.canClose ? (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={disabled}
                            loading={busy && actions.busy?.status === "COMPLETED"}
                            aria-label={T.actions.attendedLabel(row.patientLabel)}
                            onClick={() => actions.onCloseAppointment(row, "COMPLETED")}
                          >
                            {busy && actions.busy?.status === "COMPLETED" ? null : <Check aria-hidden />}
                            {T.actions.attended}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
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
                          variant="plain"
                          size="sm"
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
                        className="text-muted-foreground hover:text-foreground"
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
    </div>
  );
}
