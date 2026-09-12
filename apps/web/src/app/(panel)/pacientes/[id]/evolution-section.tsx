"use client";

import { useActionState, useState } from "react";
import { computeBmi, computeWaistHipRatio } from "@nutri-bot/core";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { EvolutionChart } from "@/components/evolution-chart";
import {
  addEvolutionEntryAction,
  deleteEvolutionEntryAction,
  type ActionState,
} from "./clinical-actions";

export interface EvolutionRow {
  id: string;
  recordedAtISO: string;
  recordedAtLabel: string;
  weightKg: number | null;
  heightCm: number | null;
  waistCm: number | null;
  hipCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  calfCm: number | null;
  tricepsSkinfoldMm: number | null;
  subscapularSkinfoldMm: number | null;
  abdominalSkinfoldMm: number | null;
  note: string | null;
}

const initial: ActionState = { ok: false };

export function EvolutionSection({
  patientId,
  entries,
}: {
  patientId: string;
  entries: EvolutionRow[];
}) {
  const [state, action, pending] = useActionState(addEvolutionEntryAction, initial);
  const [showMore, setShowMore] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Chart entries={entries} field="weightKg" label="Peso (kg)" unit="kg" color="#3c7a24" />
        <Chart entries={entries} field="waistCm" label="Cintura (cm)" unit="cm" color="#2563eb" />
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="patientId" value={patientId} />
        <div className="grid gap-4 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
          <Field label="Fecha">
            <Input type="date" name="recordedAt" defaultValue={today} required />
          </Field>
          <Field label="Peso (kg)">
            <Input type="number" step="0.1" min="0" name="weightKg" placeholder="70.5" className="w-28" />
          </Field>
          <Field label="Nota">
            <Textarea name="note" rows={1} placeholder="Observaciones de la consulta…" />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Agregando…" : "Agregar"}
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="text-xs font-semibold uppercase tracking-[0.06em] text-leaf-deep"
        >
          {showMore ? "− Ocultar medidas antropométricas" : "+ Agregar medidas antropométricas"}
        </button>

        {showMore ? (
          <div className="grid gap-3 border border-dashed border-line p-4 sm:grid-cols-4">
            <Field label="Talla (cm)">
              <Input type="number" step="0.1" min="0" name="heightCm" placeholder="170" />
            </Field>
            <Field label="Cintura (cm)">
              <Input type="number" step="0.1" min="0" name="waistCm" placeholder="90" />
            </Field>
            <Field label="Cadera (cm)">
              <Input type="number" step="0.1" min="0" name="hipCm" placeholder="100" />
            </Field>
            <Field label="Brazo (cm)">
              <Input type="number" step="0.1" min="0" name="armCm" />
            </Field>
            <Field label="Muslo (cm)">
              <Input type="number" step="0.1" min="0" name="thighCm" />
            </Field>
            <Field label="Pantorrilla (cm)">
              <Input type="number" step="0.1" min="0" name="calfCm" />
            </Field>
            <Field label="Pliegue tricipital (mm)">
              <Input type="number" step="0.1" min="0" name="tricepsSkinfoldMm" />
            </Field>
            <Field label="Pliegue subescapular (mm)">
              <Input type="number" step="0.1" min="0" name="subscapularSkinfoldMm" />
            </Field>
            <Field label="Pliegue abdominal (mm)">
              <Input type="number" step="0.1" min="0" name="abdominalSkinfoldMm" />
            </Field>
          </div>
        ) : null}
      </form>
      {state.error ? <p className="reveal text-sm text-red-600">{state.error}</p> : null}

      {entries.length === 0 ? (
        <p className="text-sm text-ink-faint">Todavía no hay registros de evolución.</p>
      ) : (
        <ul className="divide-y divide-line border border-line bg-paper text-sm">
          {entries.map((e) => {
            const bmi = computeBmi(e.weightKg, e.heightCm);
            const whr = computeWaistHipRatio(e.waistCm, e.hipCm);
            const measures = [
              e.weightKg !== null ? `${e.weightKg} kg` : null,
              e.waistCm !== null ? `Cintura ${e.waistCm} cm` : null,
              e.hipCm !== null ? `Cadera ${e.hipCm} cm` : null,
              e.armCm !== null ? `Brazo ${e.armCm} cm` : null,
              e.thighCm !== null ? `Muslo ${e.thighCm} cm` : null,
              e.calfCm !== null ? `Pantorrilla ${e.calfCm} cm` : null,
              e.tricepsSkinfoldMm !== null ? `Pliegue tríceps ${e.tricepsSkinfoldMm} mm` : null,
              e.subscapularSkinfoldMm !== null
                ? `Pliegue subescapular ${e.subscapularSkinfoldMm} mm`
                : null,
              e.abdominalSkinfoldMm !== null ? `Pliegue abdominal ${e.abdominalSkinfoldMm} mm` : null,
              bmi !== null ? `IMC ${bmi}` : null,
              whr !== null ? `ICC ${whr}` : null,
            ].filter((v): v is string => v !== null);

            return (
              <li key={e.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{e.recordedAtLabel}</p>
                  {measures.length > 0 ? (
                    <p className="mt-0.5 text-ink-soft">{measures.join(" · ")}</p>
                  ) : null}
                  {e.note ? <p className="mt-0.5 truncate text-ink-faint">{e.note}</p> : null}
                </div>
                <form action={deleteEvolutionEntryAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="patientId" value={patientId} />
                  <button
                    type="submit"
                    className="shrink-0 text-xs font-semibold text-ink-faint transition-colors hover:text-red-600"
                  >
                    Borrar
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Chart({
  entries,
  field,
  label,
  unit,
  color,
}: {
  entries: EvolutionRow[];
  field: keyof EvolutionRow;
  label: string;
  unit: string;
  color: string;
}) {
  const points = entries
    .filter((e) => e[field] !== null)
    .map((e) => ({ date: new Date(e.recordedAtISO), value: e[field] as number }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (points.length < 2) {
    return (
      <div className="border border-line bg-paper p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">{label}</p>
        <p className="text-xs text-ink-faint">Cargá al menos dos valores para ver el gráfico.</p>
      </div>
    );
  }

  const last = points[points.length - 1]!;

  return (
    <div className="border border-line bg-paper p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">{label}</p>
        <p className="text-sm font-semibold text-ink">
          {last.value} {unit}
        </p>
      </div>
      <EvolutionChart points={points} seriesLabel={`${label} (${unit})`} color={color} />
    </div>
  );
}
