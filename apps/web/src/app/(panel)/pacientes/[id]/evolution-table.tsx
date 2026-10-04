"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { ISAK_TEXT, computeBmi, computeWaistHipRatio } from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { MoreActionsMenu } from "@/components/more-actions-menu";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, EmptyState, Quantity } from "@/components/ui";
import { UNDO_TEXT, useDeferredDelete } from "@/lib/deferred-delete";
import { deleteEvolutionEntryByIdAction } from "./clinical-actions";
import type { EvolutionRow } from "./evolution-types";

/** El resto de las medidas que no tienen columna propia, con los mismos textos de siempre. */
function detailText(e: EvolutionRow): string {
  return [
    e.armCm !== null ? `Brazo relajado ${e.armCm} cm` : null,
    e.thighCm !== null ? `Muslo medio ${e.thighCm} cm` : null,
    e.calfCm !== null ? `Pierna ${e.calfCm} cm` : null,
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

const VALUE_LABELS = [
  ["weightKg", "Peso"],
  ["heightCm", "Talla"],
  ["waistCm", "Cintura"],
  ["hipCm", "Cadera"],
  ["bodyFatPercent", "Grasa"],
  ["muscleMassKg", "Masa muscular"],
] as const satisfies readonly (readonly [keyof EvolutionRow, string])[];

/** "…" de una fila de Historial → "Borrar medición", con confirmación y "Deshacer" (HU-017c-3). */
function EvolutionRowMenu({ patientId, entry }: { patientId: string; entry: EvolutionRow }) {
  const confirm = useConfirm();
  const deferDelete = useDeferredDelete();
  const day = entry.recordedAtShortLabel.slice(0, 5);
  const isak = entry.study === "ISAK";

  // Confirmación en el handler, fuera de toda transición (React 19: si no, deadlock).
  async function handleDelete() {
    const labels = VALUE_LABELS.filter(([key]) => entry[key] !== null).map(([, label]) => label);
    const ok = await confirm(
      isak
        ? {
            title: ISAK_TEXT.deleteTitle,
            // R7 (017c-4): "y su informe" si el estudio lo tiene, como en la consulta.
            description: entry.hasReport ? ISAK_TEXT.deleteWithReportDescription : ISAK_TEXT.deleteDescription,
            confirmLabel: ISAK_TEXT.deleteLabel,
          }
        : {
            title: UNDO_TEXT.measurement.confirmTitle,
            description: UNDO_TEXT.measurement.confirmDescription(day, labels),
            confirmLabel: UNDO_TEXT.measurement.confirmLabel,
          },
    );
    if (!ok) return;
    deferDelete({
      // El estudio ISAK usa su propia key: así también se oculta en la tarjeta de la consulta.
      key: isak ? `isak:${entry.id}` : `measurement:${entry.id}`,
      message: isak ? ISAK_TEXT.deleted : UNDO_TEXT.measurement.deleted,
      undoneMessage: isak ? UNDO_TEXT.study.undone : UNDO_TEXT.measurement.undone,
      commit: () => deleteEvolutionEntryByIdAction(patientId, entry.id),
    });
  }

  return (
    <MoreActionsMenu
      label={`Más opciones de la medición del ${entry.recordedAtShortLabel}`}
      actions={[
        {
          key: "borrar",
          label: isak ? ISAK_TEXT.deleteLabel : UNDO_TEXT.measurement.confirmLabel,
          icon: <Trash2 />,
          destructive: true,
          onSelect: handleDelete,
        },
      ]}
    />
  );
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
        className: "w-14",
        cell: (e) => (
          <EvolutionRowMenu patientId={patientId} entry={e} />
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
