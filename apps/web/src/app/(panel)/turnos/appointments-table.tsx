"use client";

import {
  ArrowUpRight,
  BanknoteX,
  Check,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  Coins,
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

/** HU-021 V2 (referencia visual). Ícono de cada estado: el ícono y el texto son los que distinguen el
 *  estado; el color (rojo en los cancelados) solo se suma, nunca es el único indicador. */
export const ROW_STATUS_ICON: Record<AppointmentRowStatus, LucideIcon> = {
  upcoming: Circle,
  unclosed: CircleAlert,
  completed: CircleCheck,
  no_show: CircleX,
  cancelled: CircleX,
  deposit_unpaid: CircleX,
  awaiting_deposit: Clock,
};

/** Ícono de lo registrado como pagado. "free" ("—") va sin pastilla. */
const PAYMENT_ICON: Record<Exclude<AppointmentPaymentState, "free">, LucideIcon> = {
  paid: Check,
  partial: Coins,
  none: BanknoteX,
};

/** Estilo de la pastilla (Estado y Pago, tabla y celular):
 *  - outlined: blanca con borde fino; estados abiertos y pagos sin completar.
 *  - plain: pastilla blanca sin borde, con ícono relleno; estados cerrados.
 *  - danger: tinte rojo con ícono relleno; cancelados (también por seña sin pagar).
 *  - success: tinte verde; "Pago completado". */
type PillTone = "outlined" | "plain" | "danger" | "success";

const STATUS_TONE: Record<AppointmentRowStatus, PillTone> = {
  upcoming: "outlined",
  unclosed: "outlined",
  awaiting_deposit: "outlined",
  completed: "plain",
  no_show: "plain",
  cancelled: "danger",
  deposit_unpaid: "danger",
};

/** Mismo padding en los cuatro estilos, así el ícono queda alineado aunque no haya pastilla visible. */
const pillClass =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-footnote font-medium";

const PILL_TONE_CLASS: Record<PillTone, string> = {
  outlined: "border-border bg-background text-foreground shadow-card more-contrast:border-input",
  // Halo suave en vez de borde (referencia V3): la pastilla se despega apenas del fondo de la tabla.
  plain: "border-transparent bg-background text-foreground shadow-[0_1px_4px_rgb(0_0_0/0.07)]",
  danger: "border-transparent bg-destructive-muted-hover text-destructive",
  success:
    "border-transparent bg-success-muted text-success more-contrast:border-success",
};

/** Ícono relleno: el círculo toma el color del texto y el trazo, el del fondo (el glifo queda calado). */
const FILLED_ICON_CLASS: Partial<Record<PillTone, string>> = {
  plain: "fill-foreground text-background",
  danger: "fill-destructive text-destructive-muted-hover",
};

function PillIcon({ icon: Icon, tone }: { icon: LucideIcon; tone: PillTone }) {
  const filled = FILLED_ICON_CLASS[tone];
  return <Icon className={cn("size-3.5 shrink-0", filled)} strokeWidth={filled ? 2.5 : 2} aria-hidden />;
}

/** «Abrir ↗» de la fila, con aspecto de texto gris. */
const textActionClass = "px-2 font-normal text-muted-foreground hover:text-foreground";

/** Id del botón "Abrir" de la fila: al cerrar el detalle, el foco vuelve ahí. */
export function openButtonId(appointmentId: string): string {
  return `turno-abrir-${appointmentId}`;
}

export function StatusPill({ row }: { row: AppointmentListRow }) {
  const tone = STATUS_TONE[row.rowStatus];
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className={cn(pillClass, PILL_TONE_CLASS[tone])}>
        <PillIcon icon={ROW_STATUS_ICON[row.rowStatus]} tone={tone} />
        {row.statusLabel}
      </span>
      {row.statusNote ? <span className="text-footnote text-muted-foreground">{row.statusNote}</span> : null}
    </span>
  );
}

/** R8: sin tonos de advertencia ni de error; solo "Pago completado" va en verde. "—" (sin cargo) va sin pastilla. */
export function PaymentPill({ row }: { row: AppointmentListRow }) {
  if (row.payment.state === "free") return <span className="text-muted-foreground">{row.paymentText}</span>;
  const tone: PillTone = row.payment.state === "paid" ? "success" : "outlined";
  return (
    <span className={cn(pillClass, PILL_TONE_CLASS[tone])}>
      <PillIcon icon={PAYMENT_ICON[row.payment.state]} tone={tone} />
      {row.paymentText}
    </span>
  );
}

export interface AppointmentRowActions {
  onOpen: (id: string, origin: HTMLElement) => void;
}

/** HU-021 V3 (referencia visual 2026-10-31). Tabla de escritorio (≥ 640 px) en un panel casi blanco con
 *  un contorno muy fino; el encabezado sin franja, sin líneas divisorias y filas amplias. Columnas de datos al ancho
 *  de su contenido y Nota con el espacio que sobra. Las acciones (Vino, No vino, Registrar pago) viven en el
 *  detalle; la fila solo tiene «Abrir ↗». */
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
  // Columnas de datos al ancho de su contenido más un espacio fijo; Nota se queda con el resto.
  const head = "h-11 text-callout font-normal text-muted-foreground";
  const fit = "w-px whitespace-nowrap pr-8";
  const cell = "py-2 text-callout";
  return (
    <Table containerClassName="rounded-[1.25rem] border border-black/[0.05] bg-[#fcfbfd] px-2 pt-1 shadow-[0_1px_2px_rgb(0_0_0/0.03)] more-contrast:border-input">
      <caption className="sr-only">{caption}</caption>
      {/* Sin el fondo blanco ni la línea del encabezado de la tabla base: el panel es uno solo. */}
      <TableHeader className="bg-transparent [&_tr]:border-0">
        <TableRow className="border-0 hover:bg-transparent">
          <TableHead className={cn(head, fit, "pl-4")}>{T.columns.status}</TableHead>
          <TableHead className={cn(head, fit)}>{T.columns.patient}</TableHead>
          <TableHead className={cn(head, fit)}>{T.columns.date}</TableHead>
          <TableHead className={cn(head, fit)}>{T.columns.time}</TableHead>
          <TableHead className={cn(head, fit)}>{T.columns.price}</TableHead>
          <TableHead className={cn(head, fit)}>{T.columns.payment}</TableHead>
          <TableHead className={head}>{T.columns.reason}</TableHead>
          <TableHead className={cn(head, "w-px pr-4")}>
            <span className="sr-only">{T.columns.actions}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} className="border-0 hover:bg-transparent">
            <TableCell className={cn(cell, fit, "h-14 pl-4")}>
              <StatusPill row={row} />
            </TableCell>
            <TableCell className={cn(cell, fit)}>
              <span className="inline-flex items-center gap-2">
                <span>{row.patientLabel}</span>
                {row.patientArchived ? <Badge tone="neutral">{T.archived}</Badge> : null}
              </span>
            </TableCell>
            <TableCell className={cn(cell, fit, "tabular-nums")}>{row.dateLabel}</TableCell>
            <TableCell className={cn(cell, fit, "tabular-nums")}>{row.timeLabel}</TableCell>
            <TableCell className={cn(cell, fit, "tabular-nums", row.payment.state === "free" && "text-muted-foreground")}>
              {row.priceLabel}
            </TableCell>
            <TableCell className={cn(cell, fit)}>
              <PaymentPill row={row} />
            </TableCell>
            <TableCell className={cell}>
              <AppointmentReasonCell reason={row.reason} />
            </TableCell>
            <TableCell className={cn(cell, "pr-4")}>
              {actions ? (
                <div className="flex items-center justify-end whitespace-nowrap">
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
        ))}
      </TableBody>
    </Table>
  );
}
