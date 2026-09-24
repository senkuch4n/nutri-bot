"use client";

import { useMemo } from "react";
import { Stethoscope } from "lucide-react";
import type { ConsultationChip } from "@nutri-bot/core";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge, Card, EmptyState } from "@/components/ui";
import { NewConsultationButton } from "./consultation-date-sheet";

export interface ConsultationRow {
  id: string;
  consultedAtISO: string;
  /** "dd/MM/yyyy" en la zona de la profesional */
  dateLabel: string;
  /** "HH:mm" si viene de un turno; null si es sin turno */
  timeLabel: string | null;
  /** Nombre del servicio del turno; null si es sin turno */
  originLabel: string | null;
  chips: ConsultationChip[];
}

/** Pestaña Consultas (HU-003): una fila por consulta, de la más nueva a la más vieja. */
export function ConsultationsSection({
  patientId,
  todayKey,
  consultations,
}: {
  patientId: string;
  todayKey: string;
  consultations: ConsultationRow[];
}) {
  const columns = useMemo<DataTableColumn<ConsultationRow>[]>(
    () => [
      {
        id: "fecha",
        header: "Fecha",
        cell: (c) => (
          <span className="whitespace-nowrap font-medium tabular-nums">
            {c.dateLabel}
            {c.timeLabel ? <span className="font-normal text-muted-foreground"> · {c.timeLabel} hs</span> : null}
          </span>
        ),
        sortValue: (c) => new Date(c.consultedAtISO),
      },
      {
        id: "origen",
        header: "Origen",
        cell: (c) => (c.originLabel ? <span>{c.originLabel}</span> : <Badge tone="neutral">Sin turno</Badge>),
      },
      {
        id: "contenido",
        header: "Contenido",
        cell: (c) =>
          c.chips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {c.chips.map((chip) => (
                <Badge key={chip} tone="neutral">
                  {chip}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">Sin registros</span>
          ),
      },
    ],
    [],
  );

  const newButton = <NewConsultationButton patientId={patientId} todayKey={todayKey} />;

  return (
    <Card title="Consultas" padding="none" actions={consultations.length > 0 ? newButton : undefined}>
      <DataTable
        columns={columns}
        rows={consultations}
        getRowId={(c) => c.id}
        rowHref={(c) => `/pacientes/${patientId}/consultas/${c.id}`}
        initialSort={{ columnId: "fecha", direction: "desc" }}
        caption="Consultas"
        empty={
          <EmptyState
            icon={Stethoscope}
            title="Todavía no hay consultas"
            description="Se crean solas al marcar un turno como completado, o podés crear una a mano."
            action={newButton}
          />
        }
      />
    </Card>
  );
}
