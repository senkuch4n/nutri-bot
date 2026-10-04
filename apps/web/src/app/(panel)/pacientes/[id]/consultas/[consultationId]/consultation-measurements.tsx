"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { ISAK_TEXT, computeBmi, computeWaistHipRatio, measurementKinds } from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { MoreActionsMenu } from "@/components/more-actions-menu";
import { Button, Card, EmptyState, FormError, Quantity } from "@/components/ui";
import { UNDO_TEXT, useDeferredDelete, usePendingDeletions } from "@/lib/deferred-delete";
import { useActionToast } from "@/lib/notify";
import type { ActionState } from "../../clinical-actions";
import {
  addConsultationMeasurementAction,
  deleteConsultationMeasurementAction,
} from "../../consultation-actions";
import {
  BIOIMPEDANCE_METRICS,
  PERIMETER_MEASURES,
  SKINFOLD_MEASURES,
  type EvolutionRow,
} from "../../evolution-types";
import { MeasurementFields } from "../../measurement-fields";

type Item = { label: string; value: number | null; unit?: string; decimals?: number };

function anthropometryItems(e: EvolutionRow): Item[] {
  return [
    { label: "Peso", value: e.weightKg, unit: "kg" },
    { label: "Talla", value: e.heightCm, unit: "cm" },
    { label: "IMC", value: computeBmi(e.weightKg, e.heightCm) },
    ...PERIMETER_MEASURES.slice(0, 2).map((m) => ({ label: m.label, value: e[m.key], unit: "cm" })),
    { label: "ICC", value: computeWaistHipRatio(e.waistCm, e.hipCm), decimals: 2 },
    ...PERIMETER_MEASURES.slice(2).map((m) => ({ label: m.label, value: e[m.key], unit: "cm" })),
    ...SKINFOLD_MEASURES.map((m) => ({ label: `Pliegue ${m.label.toLowerCase()}`, value: e[m.key], unit: "mm" })),
  ];
}

function bioimpedanceItems(e: EvolutionRow, withWeight: boolean): Item[] {
  return [
    ...(withWeight ? [{ label: "Peso", value: e.weightKg, unit: "kg" }] : []),
    ...BIOIMPEDANCE_METRICS.map((m) => ({
      label: m.label,
      value: e[m.key],
      unit: m.unit || undefined,
      decimals: m.decimals,
    })),
  ];
}

/** Mediciones de la consulta, agrupadas en Antropometría y Bioimpedancia (core: measurementKinds). */
export function ConsultationMeasurements({
  patientId,
  consultationId,
  entries,
}: {
  patientId: string;
  consultationId: string;
  entries: EvolutionRow[];
}) {
  const [showForm, setShowForm] = useState(false);
  const formId = useId();
  // HU-017c-3: las mediciones (y el estudio ISAK) con borrado pendiente no se muestran.
  const pending = usePendingDeletions();
  const visible = entries.filter((e) => !pending.has(`measurement:${e.id}`) && !pending.has(`isak:${e.id}`));
  const grouped = visible.map((e) => ({ entry: e, kinds: measurementKinds(e) }));
  const anthropometry = grouped.filter((g) => g.kinds.anthropometry);
  // HU-006: el estudio ISAK se resume en Antropometría (una línea con enlace); nunca en Bioimpedancia.
  const bioimpedance = grouped.filter((g) => g.kinds.bioimpedance && g.entry.study !== "ISAK");

  return (
    <Card
      title="Mediciones"
      actions={
        <Button
          type="button"
          variant="secondary"
          size="lg"
          aria-expanded={showForm}
          aria-controls={formId}
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus aria-hidden />
          Agregar medición
        </Button>
      }
    >
      {showForm ? (
        <div id={formId} className="mb-6 rounded-lg border p-4">
          <ConsultationMeasurementForm patientId={patientId} consultationId={consultationId} />
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState title="Sin mediciones en esta consulta." />
      ) : (
        <div className="space-y-8">
          {anthropometry.length > 0 ? (
            <MeasurementGroup
              title="Antropometría"
              patientId={patientId}
              consultationId={consultationId}
              blocks={anthropometry.map(({ entry }) => ({ entry, items: anthropometryItems(entry) }))}
            />
          ) : null}
          {bioimpedance.length > 0 ? (
            <MeasurementGroup
              title="Bioimpedancia"
              patientId={patientId}
              consultationId={consultationId}
              blocks={bioimpedance.map(({ entry, kinds }) => ({
                entry,
                // El peso va en Antropometría si la medición está ahí; si no, acá.
                items: bioimpedanceItems(entry, !kinds.anthropometry),
              }))}
            />
          ) : null}
        </div>
      )}
    </Card>
  );
}

function MeasurementGroup({
  title,
  patientId,
  consultationId,
  blocks,
}: {
  title: string;
  patientId: string;
  consultationId: string;
  blocks: { entry: EvolutionRow; items: Item[] }[];
}) {
  return (
    <section aria-label={title}>
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      <div className="space-y-3">
        {blocks.map(({ entry, items }) => {
          if (entry.study === "ISAK") {
            return (
              <div key={entry.id} className="rounded-lg border p-4 text-sm">
                <span className="font-medium">{ISAK_TEXT.measurementRow}</span>
                <span className="text-muted-foreground"> · </span>
                <Link
                  href={`/pacientes/${patientId}/consultas/${consultationId}/antropometria`}
                  className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {ISAK_TEXT.measurementRowLink}
                </Link>
              </div>
            );
          }
          const shown = items.filter((i) => i.value !== null);
          return (
            <div key={entry.id} className="rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  {shown.length > 0 ? (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                      {shown.map((i) => (
                        <div key={i.label} className="min-w-0">
                          <dt className="text-xs text-muted-foreground">{i.label}</dt>
                          <dd className="text-sm font-medium">
                            <Quantity value={i.value} unit={i.unit} decimals={i.decimals} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {entry.note ? (
                    <p
                      className={
                        shown.length > 0
                          ? "mt-3 break-words text-sm text-muted-foreground"
                          : "break-words text-sm text-muted-foreground"
                      }
                    >
                      {entry.note}
                    </p>
                  ) : null}
                </div>
                <MeasurementMoreMenu
                  patientId={patientId}
                  consultationId={consultationId}
                  entry={entry}
                  labels={shown.map((i) => i.label)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MeasurementMoreMenu({
  patientId,
  consultationId,
  entry,
  labels,
}: {
  patientId: string;
  consultationId: string;
  entry: EvolutionRow;
  /** Rótulos de los valores cargados, para la confirmación ("peso, cintura…"). */
  labels: string[];
}) {
  const confirm = useConfirm();
  const deferDelete = useDeferredDelete();
  const day = entry.recordedAtShortLabel.slice(0, 5);

  // Confirmación en el handler, fuera de toda transición (React 19: si no, deadlock).
  async function handleDelete() {
    const ok = await confirm({
      title: UNDO_TEXT.measurement.confirmTitle,
      description: UNDO_TEXT.measurement.confirmDescription(day, labels),
      confirmLabel: UNDO_TEXT.measurement.confirmLabel,
    });
    if (!ok) return;
    deferDelete({
      key: `measurement:${entry.id}`,
      message: UNDO_TEXT.measurement.deleted,
      undoneMessage: UNDO_TEXT.measurement.undone,
      commit: () => deleteConsultationMeasurementAction(patientId, consultationId, entry.id),
    });
  }

  return (
    <MoreActionsMenu
      label={`Más opciones de la medición${labels.length ? ` (${labels.slice(0, 2).join(", ").toLowerCase()})` : ""}`}
      className="-mr-2 -mt-2"
      actions={[
        {
          key: "borrar",
          label: UNDO_TEXT.measurement.confirmLabel,
          icon: <Trash2 />,
          destructive: true,
          onSelect: handleDelete,
        },
      ]}
    />
  );
}

const initial: ActionState = { ok: false };

/** Alta de una medición en la consulta: los campos de Evolución, sin "Fecha" (es la de la consulta). */
export function ConsultationMeasurementForm({
  patientId,
  consultationId,
}: {
  patientId: string;
  consultationId: string;
}) {
  const [state, action, pending] = useActionState(addConsultationMeasurementAction, initial);
  useActionToast(state, { success: "Medición agregada" });
  // Se remonta al guardar: campos vacíos y desplegables cerrados.
  const [formKey, setFormKey] = useState(0);
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state.ok) setFormKey((k) => k + 1);
  }

  return (
    <form key={formKey} action={action} className="space-y-4">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="consultationId" value={consultationId} />
      <MeasurementFields
        submit={
          <Button type="submit" loading={pending}>
            {pending ? "Agregando…" : "Agregar"}
          </Button>
        }
      />
      <FormError message={state.error} />
    </form>
  );
}
