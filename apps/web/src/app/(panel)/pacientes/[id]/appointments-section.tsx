import Link from "next/link";
import { CalendarCheck, CalendarX, CircleCheck, CircleSlash, Clock, UserX, type LucideIcon } from "lucide-react";
import { APPOINTMENT_STATUS_TEXT, type AppointmentStatusLike } from "@nutri-bot/core";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/primitives/table";
import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";
import { AppointmentReasonCell } from "./appointment-reason-cell";

export interface AppointmentRow {
  id: string;
  /** "Jueves 8 de octubre, 10:00" (formatAppointmentWhen, en la zona de la profesional). */
  whenLabel: string;
  serviceName: string;
  priceLabel: string;
  status: AppointmentStatusLike;
  /** Detalle de la consulta del turno (HU-003); null si no tiene. */
  consultationHref: string | null;
  /** HU-013: motivo de consulta; null si no dejó. */
  reason: string | null;
}

const STATUS_ICON: Record<AppointmentStatusLike, { icon: LucideIcon; className: string }> = {
  CONFIRMED: { icon: CalendarCheck, className: "text-info" },
  AWAITING_PAYMENT: { icon: Clock, className: "text-warning" },
  COMPLETED: { icon: CircleCheck, className: "text-success" },
  CANCELLED: { icon: CircleSlash, className: "text-muted-foreground" },
  NO_SHOW: { icon: UserX, className: "text-destructive" },
};

/** Estado en palabras con ícono: el color nunca es el único indicador. */
function StatusLabel({ status }: { status: AppointmentStatusLike }) {
  const { icon: Icon, className } = STATUS_ICON[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon className={cn("size-4 shrink-0", className)} strokeWidth={1.75} aria-hidden />
      {APPOINTMENT_STATUS_TEXT[status]}
    </span>
  );
}

function ConsultationLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="relative rounded-sm font-medium text-primary touch-target press-none pressed:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      Ver consulta
    </Link>
  );
}

/** Historial › Turnos (HU-017c-2): la frase de resumen arriba; en el celular una lista agrupada y en
 *  pantallas anchas la tabla. Server component. */
export function AppointmentsSection({ summary, appointments }: { summary: string; appointments: AppointmentRow[] }) {
  return (
    <section aria-labelledby="turnos-titulo">
      <h2 id="turnos-titulo" className="text-title-3">
        Turnos
      </h2>
      <p className="mb-4 mt-1 text-body text-muted-foreground">{summary}</p>

      {appointments.length === 0 ? (
        <div className="rounded-xl bg-card shadow-card more-contrast:border more-contrast:border-input">
          <EmptyState icon={CalendarX} title="Sin turnos registrados" />
        </div>
      ) : (
        <>
          {/* Celular y tablet chica: lista agrupada. */}
          <ul className="overflow-hidden rounded-xl bg-card shadow-card more-contrast:border more-contrast:border-input md:hidden">
            {appointments.map((a) => (
              <li
                key={a.id}
                className="relative px-4 py-3 after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-border last:after:hidden"
              >
                <p className="text-headline">{a.whenLabel}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-callout text-muted-foreground">
                  <span>{a.serviceName}</span>
                  <span aria-hidden>·</span>
                  <span className="text-foreground">
                    <StatusLabel status={a.status} />
                  </span>
                </p>
                {a.reason ? (
                  <div className="mt-1 text-callout text-muted-foreground">
                    <AppointmentReasonCell reason={a.reason} />
                  </div>
                ) : null}
                {a.consultationHref ? (
                  <div className="mt-2 text-callout">
                    <ConsultationLink href={a.consultationHref} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          {/* Desde 768 px: la tabla. */}
          <div className="hidden overflow-hidden rounded-xl bg-card shadow-card more-contrast:border more-contrast:border-input md:block">
            <Table containerClassName="max-h-[28rem]">
              <caption className="sr-only">Historial de turnos</caption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Fecha y hora</TableHead>
                  <TableHead>Servicio</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead numeric>Precio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>
                    <span className="sr-only">Consulta</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="tabular-nums">{a.whenLabel}</TableCell>
                    <TableCell>{a.serviceName}</TableCell>
                    <TableCell>
                      {a.reason ? <AppointmentReasonCell reason={a.reason} /> : <span className="text-muted-foreground">Sin motivo</span>}
                    </TableCell>
                    <TableCell numeric>{a.priceLabel}</TableCell>
                    <TableCell>
                      <StatusLabel status={a.status} />
                    </TableCell>
                    <TableCell>{a.consultationHref ? <ConsultationLink href={a.consultationHref} /> : null}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </section>
  );
}
