"use client";

import { useActionState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
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
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <WeightChart entries={entries} />

      <form action={action} className="grid gap-4 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
        <input type="hidden" name="patientId" value={patientId} />
        <Field label="Fecha">
          <Input type="date" name="recordedAt" defaultValue={today} required />
        </Field>
        <Field label="Peso (kg)">
          <Input
            type="number"
            step="0.1"
            min="0"
            name="weightKg"
            placeholder="70.5"
            className="w-28"
          />
        </Field>
        <Field label="Nota">
          <Textarea name="note" rows={1} placeholder="Observaciones de la consulta…" />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Agregando…" : "Agregar"}
        </Button>
      </form>
      {state.error ? <p className="reveal text-sm text-red-600">{state.error}</p> : null}

      {entries.length === 0 ? (
        <p className="text-sm text-ink-faint">Todavía no hay registros de evolución.</p>
      ) : (
        <ul className="divide-y divide-line border border-line bg-paper text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">
                  {e.recordedAtLabel}
                  {e.weightKg !== null ? (
                    <span className="ml-2 text-ink-soft">{e.weightKg} kg</span>
                  ) : null}
                </p>
                {e.note ? <p className="mt-0.5 truncate text-ink-soft">{e.note}</p> : null}
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
          ))}
        </ul>
      )}
    </div>
  );
}

function WeightChart({ entries }: { entries: EvolutionRow[] }) {
  const points = entries
    .filter((e) => e.weightKg !== null)
    .map((e) => ({ x: new Date(e.recordedAtISO).getTime(), y: e.weightKg as number }))
    .sort((a, b) => a.x - b.x);

  if (points.length < 2) {
    return (
      <p className="text-xs text-ink-faint">
        Cargá al menos dos pesos para ver el gráfico de evolución.
      </p>
    );
  }

  const width = 560;
  const height = 140;
  const padding = 12;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys) - 1;
  const maxY = Math.max(...ys) + 1;

  const scaleX = (x: number) =>
    padding + ((x - minX) / (maxX - minX || 1)) * (width - padding * 2);
  const scaleY = (y: number) =>
    height - padding - ((y - minY) / (maxY - minY || 1)) * (height - padding * 2);

  const path = points.map((p) => `${scaleX(p.x)},${scaleY(p.y)}`).join(" ");

  return (
    <div className="border border-line bg-paper p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Evolución de peso">
        <polyline points={path} fill="none" stroke="currentColor" strokeWidth="2" className="text-leaf" />
        {points.map((p, i) => (
          <circle key={i} cx={scaleX(p.x)} cy={scaleY(p.y)} r="3" className="fill-leaf-deep" />
        ))}
      </svg>
    </div>
  );
}
