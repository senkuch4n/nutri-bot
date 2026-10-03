import Link from "next/link";
import { CalendarX } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/primitives/table";
import { Badge, Card, EmptyState } from "@/components/ui";
import { AppointmentReasonCell } from "./appointment-reason-cell";

export interface AppointmentRow {
  id: string;
  /** "dd/MM/yyyy · HH:mm hs" */
  startsAtLabel: string;
  serviceName: string;
  priceLabel: string;
  status: { tone: "info" | "warning" | "success" | "neutral" | "danger"; label: string };
  /** Detalle de la consulta del turno (HU-003); null si no tiene. */
  consultationHref: string | null;
  /** HU-013: motivo de consulta; null → "—". */
  reason: string | null;
}

/** Pestaña Turnos. Server component: usa los primitivos de tabla, no DataTable. */
export function AppointmentsSection({ appointments }: { appointments: AppointmentRow[] }) {
  return (
    <Card title="Historial de turnos" padding="none">
      {appointments.length === 0 ? (
        <EmptyState icon={CalendarX} title="Sin turnos registrados" />
      ) : (
        <Table containerClassName="max-h-[28rem]">
          <caption className="sr-only">Historial de turnos</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Fecha y hora</TableHead>
              <TableHead>Servicio</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead numeric>Precio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Consulta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appointments.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="tabular-nums">{a.startsAtLabel}</TableCell>
                <TableCell>{a.serviceName}</TableCell>
                <TableCell>
                  <AppointmentReasonCell reason={a.reason} />
                </TableCell>
                <TableCell numeric>{a.priceLabel}</TableCell>
                <TableCell>
                  <Badge tone={a.status.tone}>{a.status.label}</Badge>
                </TableCell>
                <TableCell>
                  {a.consultationHref ? (
                    <Link
                      href={a.consultationHref}
                      className="rounded-sm font-medium text-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Ver consulta
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
