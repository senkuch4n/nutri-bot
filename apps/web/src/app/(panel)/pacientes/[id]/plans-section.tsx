"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Field, Input, Select } from "@/components/ui";
import { createPlanAction, applyTemplateAction, type PlanListState } from "./planes/actions";

export interface PlanRow {
  id: string;
  title: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  updatedAtLabel: string;
}

const statusTone = { DRAFT: "slate", ACTIVE: "green", ARCHIVED: "slate" } as const;
const statusLabel = { DRAFT: "Borrador", ACTIVE: "Activo", ARCHIVED: "Archivado" } as const;

const initial: PlanListState = { ok: false };

export function PlansSection({
  patientId,
  plans,
  templates,
}: {
  patientId: string;
  plans: PlanRow[];
  templates: { id: string; title: string }[];
}) {
  const [createState, createAction, creating] = useActionState(createPlanAction, initial);
  const [applyState, applyAction, applying] = useActionState(applyTemplateAction, initial);
  const [mode, setMode] = useState<"nuevo" | "plantilla">("nuevo");

  return (
    <div className="space-y-4">
      {plans.length === 0 ? (
        <p className="text-sm text-ink-faint">Este paciente todavía no tiene planes cargados.</p>
      ) : (
        <ul className="divide-y divide-line border border-line bg-paper">
          {plans.map((p) => (
            <li key={p.id}>
              <Link
                href={`/pacientes/${patientId}/planes/${p.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-mint"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{p.title}</p>
                  <p className="text-xs text-ink-faint">Actualizado {p.updatedAtLabel}</p>
                </div>
                <Badge tone={statusTone[p.status]}>{statusLabel[p.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 text-xs font-semibold uppercase tracking-[0.06em]">
        <button
          type="button"
          onClick={() => setMode("nuevo")}
          className={mode === "nuevo" ? "text-leaf-deep" : "text-ink-faint"}
        >
          Plan nuevo
        </button>
        <span className="text-ink-faint">·</span>
        <button
          type="button"
          onClick={() => setMode("plantilla")}
          className={mode === "plantilla" ? "text-leaf-deep" : "text-ink-faint"}
        >
          Desde plantilla
        </button>
      </div>

      {mode === "nuevo" ? (
        <form action={createAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="patientId" value={patientId} />
          <Field label="Título del plan">
            <Input name="title" placeholder="Ej: Plan inicial" required className="w-64" />
          </Field>
          <Button type="submit" disabled={creating}>
            {creating ? "Creando…" : "Crear plan"}
          </Button>
          {createState.error ? (
            <span className="reveal text-sm text-red-600">{createState.error}</span>
          ) : null}
        </form>
      ) : templates.length === 0 ? (
        <p className="text-sm text-ink-faint">
          Todavía no tenés plantillas. Creá una en{" "}
          <Link href="/plantillas" className="underline">
            Plantillas
          </Link>
          .
        </p>
      ) : (
        <form action={applyAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="patientId" value={patientId} />
          <Field label="Plantilla">
            <Select name="templateId" defaultValue={templates[0]?.id} className="w-64">
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={applying}>
            {applying ? "Aplicando…" : "Aplicar plantilla"}
          </Button>
          {applyState.error ? (
            <span className="reveal text-sm text-red-600">{applyState.error}</span>
          ) : null}
        </form>
      )}
    </div>
  );
}
