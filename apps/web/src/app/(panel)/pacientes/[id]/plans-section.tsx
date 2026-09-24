"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ToggleGroup, ToggleGroupItem } from "@/components/primitives/toggle-group";
import { Badge, Button, Card, EmptyState, Field, FormError, Input, Select } from "@/components/ui";
import { createPlanAction, applyTemplateAction, type PlanListState } from "./planes/actions";

export interface PlanRow {
  id: string;
  title: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  updatedAtLabel: string;
}

const statusTone = { DRAFT: "neutral", ACTIVE: "success", ARCHIVED: "neutral" } as const;
const statusLabel = { DRAFT: "Borrador", ACTIVE: "Activo", ARCHIVED: "Archivado" } as const;

const columns: DataTableColumn<PlanRow>[] = [
  { id: "titulo", header: "Título", cell: (p) => <span className="font-medium">{p.title}</span> },
  { id: "estado", header: "Estado", cell: (p) => <Badge tone={statusTone[p.status]}>{statusLabel[p.status]}</Badge> },
  {
    id: "actualizado",
    header: "Actualizado",
    cell: (p) => <span className="text-muted-foreground">{p.updatedAtLabel}</span>,
  },
];

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
      <Card title="Planes nutricionales" padding="none">
        <DataTable
          columns={columns}
          rows={plans}
          getRowId={(p) => p.id}
          rowHref={(p) => `/pacientes/${patientId}/planes/${p.id}`}
          caption="Planes nutricionales"
          empty={
            <EmptyState
              icon={ClipboardList}
              title="Este paciente todavía no tiene planes"
              description="Creá el primero desde cero o a partir de una plantilla."
            />
          }
        />
      </Card>

      <Card title="Nuevo plan">
        <ToggleGroup
          type="single"
          variant="outline"
          value={mode}
          onValueChange={(v) => v && setMode(v as "nuevo" | "plantilla")}
          aria-label="Cómo crear el plan"
          className="mb-4 grid grid-cols-2 gap-0 rounded-md border border-input p-0.5 [&>button]:border-0"
        >
          <ToggleGroupItem value="nuevo" className="data-[state=on]:font-semibold">
            Plan nuevo
          </ToggleGroupItem>
          <ToggleGroupItem value="plantilla" className="data-[state=on]:font-semibold">
            Desde plantilla
          </ToggleGroupItem>
        </ToggleGroup>

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
