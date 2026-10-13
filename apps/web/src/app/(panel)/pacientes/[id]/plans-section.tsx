"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Archive, CircleCheck, ClipboardList, PencilLine, type LucideIcon } from "lucide-react";
import { GroupedList, GroupedListRow } from "@/components/grouped-list";
import { SegmentedControl } from "@/components/segmented-control";
import { Button, Card, EmptyState, Field, FormError, Input, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import { createPlanAction, applyTemplateAction, type PlanListState } from "./planes/actions";

export interface PlanRow {
  id: string;
  title: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  updatedAtLabel: string;
  /** "Indicado en la consulta del dd/MM" (primera consulta que lo indicó, HU-003); null si ninguna. */
  consultationLabel: string | null;
}

// HU-017c-2 (solo visual): estado con ícono + texto; el color no es el único indicador.
const statusMeta: Record<PlanRow["status"], { label: string; icon: LucideIcon; className: string }> = {
  ACTIVE: { label: "Activo", icon: CircleCheck, className: "text-success" },
  DRAFT: { label: "Borrador", icon: PencilLine, className: "text-muted-foreground" },
  ARCHIVED: { label: "Archivado", icon: Archive, className: "text-muted-foreground" },
};

function PlanStatus({ status }: { status: PlanRow["status"] }) {
  const { label, icon: Icon, className } = statusMeta[status];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-foreground">
      <Icon className={cn("size-3.5 shrink-0", className)} strokeWidth={2} aria-hidden />
      {label}
    </span>
  );
}

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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <section aria-labelledby="planes-titulo">
        <h2 id="planes-titulo" className="mb-3 text-title-3">
          Planes nutricionales
        </h2>
        {plans.length === 0 ? (
          <div className="rounded-xl bg-card shadow-card more-contrast:border more-contrast:border-input">
            <EmptyState
              icon={ClipboardList}
              title="Este paciente todavía no tiene planes"
              description="Creá el primero desde cero o a partir de una plantilla."
            />
          </div>
        ) : (
          <GroupedList>
            {plans.map((p) => (
              <GroupedListRow
                key={p.id}
                size="lg"
                href={`/pacientes/${patientId}/planes/${p.id}`}
                label={p.title}
                description={
                  <>
                    <span className="flex flex-wrap items-center gap-x-1.5">
                      <PlanStatus status={p.status} />
                      <span aria-hidden>·</span>
                      <span>actualizado el {p.updatedAtLabel}</span>
                    </span>
                    {p.consultationLabel ? <span className="block">{p.consultationLabel}</span> : null}
                  </>
                }
              />
            ))}
          </GroupedList>
        )}
      </section>

      <Card title="Nuevo plan">
        <SegmentedControl
          value={mode}
          onValueChange={setMode}
          options={[
            { value: "nuevo", label: "Plan nuevo" },
            { value: "plantilla", label: "Desde plantilla" },
          ]}
          aria-label="Cómo crear el plan"
          fullWidth
          className="mb-4"
        />

        {mode === "nuevo" ? (
          <form action={createAction} className="space-y-4">
            <input type="hidden" name="patientId" value={patientId} />
            <Field label="Título del plan">
              <Input name="title" placeholder="Ej: Plan inicial" required />
            </Field>
            <Button type="submit" loading={creating} className="w-full">
              {creating ? "Creando…" : "Crear plan"}
            </Button>
            <FormError message={createState.error} />
          </form>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no tenés plantillas. Creá una en{" "}
            <Link href="/plantillas" className="text-link underline-offset-4 hover:underline">
              Plantillas
            </Link>
            .
          </p>
        ) : (
          <form action={applyAction} className="space-y-4">
            <input type="hidden" name="patientId" value={patientId} />
            <Field label="Plantilla">
              <Select name="templateId" defaultValue={templates[0]?.id}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" loading={applying} className="w-full">
              {applying ? "Aplicando…" : "Aplicar plantilla"}
            </Button>
            <FormError message={applyState.error} />
          </form>
        )}
      </Card>
    </div>
  );
}
