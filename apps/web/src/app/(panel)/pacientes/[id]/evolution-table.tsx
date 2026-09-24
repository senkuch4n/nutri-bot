"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { computeBmi, computeWaistHipRatio } from "@nutri-bot/core";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Button, Card, EmptyState, Quantity } from "@/components/ui";
import { deleteEvolutionEntryAction } from "./clinical-actions";
import type { EvolutionRow } from "./evolution-types";

/** El resto de las medidas que no tienen columna propia, con los mismos textos de siempre. */
function detailText(e: EvolutionRow): string {
  return [
    e.armCm !== null ? `Brazo ${e.armCm} cm` : null,
    e.thighCm !== null ? `Muslo ${e.thighCm} cm` : null,
    e.calfCm !== null ? `Pantorrilla ${e.calfCm} cm` : null,
    e.tricepsSkinfoldMm !== null ? `Pliegue tríceps ${e.tricepsSkinfoldMm} mm` : null,
    e.subscapularSkinfoldMm !== null ? `Pliegue subescapular ${e.subscapularSkinfoldMm} mm` : null,
    e.abdominalSkinfoldMm !== null ? `Pliegue abdominal ${e.abdominalSkinfoldMm} mm` : null,
    e.bodyWaterPercent !== null ? `Agua ${e.bodyWaterPercent}%` : null,
    e.visceralFatLevel !== null ? `Grasa visceral ${e.visceralFatLevel}` : null,
    e.boneMassKg !== null ? `Masa ósea ${e.boneMassKg} kg` : null,
    e.basalMetabolicRateKcal !== null ? `MB ${e.basalMetabolicRateKcal} kcal` : null,
  ]
    .filter((v): v is string => v !== null)
    .join(" · ");
}

export function EvolutionTable({
  patientId,
  entries,
  readOnly = false,
}: {
  patientId: string;
  entries: EvolutionRow[];
  /** Solo para la página de prueba: oculta la columna de acciones. No es contrato. */
  readOnly?: boolean;
}) {
  const columns = useMemo<DataTableColumn<EvolutionRow>[]>(() => {
    const base: DataTableColumn<EvolutionRow>[] = [
      {
        id: "fecha",
        header: "Fecha",
        cell: (e) => <span className="tabular-nums">{e.recordedAtShortLabel}</span>,
        sortValue: (e) => new Date(e.recordedAtISO),
      },
      { id: "peso", header: "Peso", numeric: true, cell: (e) => <Quantity value={e.weightKg} unit="kg" />, sortValue: (e) => e.weightKg },
      {
        id: "imc",
        header: "IMC",
        numeric: true,
        cell: (e) => <Quantity value={computeBmi(e.weightKg, e.heightCm)} />,
        sortValue: (e) => computeBmi(e.weightKg, e.heightCm),
      },
      { id: "cintura", header: "Cintura", numeric: true, cell: (e) => <Quantity value={e.waistCm} unit="cm" />, sortValue: (e) => e.waistCm },
      { id: "cadera", header: "Cadera", numeric: true, cell: (e) => <Quantity value={e.hipCm} unit="cm" />, sortValue: (e) => e.hipCm },
      {
        id: "icc",
        header: "ICC",
        numeric: true,
        cell: (e) => <Quantity value={computeWaistHipRatio(e.waistCm, e.hipCm)} decimals={2} />,
        sortValue: (e) => computeWaistHipRatio(e.waistCm, e.hipCm),
      },
      { id: "grasa", header: "Grasa", numeric: true, cell: (e) => <Quantity value={e.bodyFatPercent} unit="%" />, sortValue: (e) => e.bodyFatPercent },
      {
        id: "musculo",
        header: "Masa muscular",
        numeric: true,
        cell: (e) => <Quantity value={e.muscleMassKg} unit="kg" />,
        sortValue: (e) => e.muscleMassKg,
      },
      {
        id: "detalle",
        header: "Detalle",
        className: "max-w-xs",
        cell: (e) => {
          const detail = detailText(e);
          return (
            <div className="min-w-0">
              {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
              {e.note ? (
                <p className="truncate text-xs text-muted-foreground" title={e.note}>
                  {e.note}
                </p>
              ) : null}
            </div>
          );
        },
      },
    ];
    const consultationColumn: DataTableColumn<EvolutionRow> = {
      id: "consulta",
      header: "Consulta",
      cell: (e) =>
        e.consultationId ? (
          <Link
            href={`/pacientes/${patientId}/consultas/${e.consultationId}`}
            aria-label={`Ver la consulta del ${e.recordedAtShortLabel}`}
            className="rounded-sm text-sm font-medium text-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    };
    if (readOnly) return [...base, consultationColumn];
    return [
      ...base,
      consultationColumn,
      {
        id: "acciones",
        header: "",
        className: "w-12",
        cell: (e) => (
          <form action={deleteEvolutionEntryAction}>
            <input type="hidden" name="id" value={e.id} />
            <input type="hidden" name="patientId" value={patientId} />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              aria-label={`Borrar la medición del ${e.recordedAtShortLabel}`}
            >
              <Trash2 aria-hidden />
            </Button>
          </form>
        ),
      },
    ];
  }, [patientId, readOnly]);

  return (
    <Card title="Mediciones" padding="none">
      <DataTable
        columns={columns}
        rows={entries}
        getRowId={(e) => e.id}
        initialSort={{ columnId: "fecha", direction: "desc" }}
        caption="Mediciones de evolución"
        maxHeightClassName="max-h-[28rem]"
        empty={<EmptyState title="Todavía no hay registros de evolución." />}
      />
    </Card>
  );
}
