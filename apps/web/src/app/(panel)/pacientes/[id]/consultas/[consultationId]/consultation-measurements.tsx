"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { computeBmi, computeWaistHipRatio, measurementKinds } from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { Button, Card, EmptyState, FormError, Quantity } from "@/components/ui";
import { notify, useActionToast } from "@/lib/notify";
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
  const grouped = entries.map((e) => ({ entry: e, kinds: measurementKinds(e) }));
  const anthropometry = grouped.filter((g) => g.kinds.anthropometry);
  const bioimpedance = grouped.filter((g) => g.kinds.bioimpedance);

  return (
    <Card
      title="Mediciones"
      actions={
        <Button
          type="button"
          variant="secondary"
          size="sm"
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

      {entries.length === 0 ? (
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
                <DeleteMeasurementButton patientId={patientId} consultationId={consultationId} entryId={entry.id} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DeleteMeasurementButton({
  patientId,
  consultationId,
  entryId,
}: {
  patientId: string;
  consultationId: string;
  entryId: string;
}) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  // Confirmación en el handler, fuera de toda transición (React 19: si no, deadlock).
  async function handleClick() {
    const ok = await confirm({
      title: "¿Borrar esta medición?",
      description: "No se puede deshacer.",
      confirmLabel: "Borrar medición",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteConsultationMeasurementAction(patientId, consultationId, entryId);
      if (res.ok) notify.saved("Medición borrada");
      else notify.error(res.error);
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      loading={pending}
      onClick={handleClick}
      aria-label="Borrar esta medición"
      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
    >
      {pending ? null : <Trash2 aria-hidden />}
    </Button>
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
