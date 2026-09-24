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

export interface AppointmentRow {
  id: string;
  /** "dd/MM/yyyy · HH:mm hs" */
  startsAtLabel: string;
  serviceName: string;
  priceLabel: string;
  status: { tone: "info" | "warning" | "success" | "neutral" | "danger"; label: string };
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
              <TableHead numeric>Precio</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appointments.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="tabular-nums">{a.startsAtLabel}</TableCell>
                <TableCell>{a.serviceName}</TableCell>
                <TableCell numeric>{a.priceLabel}</TableCell>
                <TableCell>
                  <Badge tone={a.status.tone}>{a.status.label}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
