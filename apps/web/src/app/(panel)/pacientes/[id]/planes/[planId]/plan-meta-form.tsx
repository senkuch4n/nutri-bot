"use client";

import { useActionState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { updatePlanMetaAction, type PlanState } from "./actions";

const initial: PlanState = { ok: false };

export function PlanMetaForm({
  planId,
  defaults,
}: {
  planId: string;
  defaults: { title: string; notes: string; status: "DRAFT" | "ACTIVE" | "ARCHIVED" };
}) {
  const [state, action, pending] = useActionState(updatePlanMetaAction, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="planId" value={planId} />
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Field label="Título">
          <Input name="title" defaultValue={defaults.title} required />
        </Field>
        <Field label="Estado">
          <Select name="status" defaultValue={defaults.status} className="w-40">
            <option value="DRAFT">Borrador</option>
            <option value="ACTIVE">Activo</option>
            <option value="ARCHIVED">Archivado</option>
          </Select>
        </Field>
      </div>
      <Field label="Notas generales">
        <Textarea name="notes" rows={2} defaultValue={defaults.notes} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        {state.error ? <span className="reveal text-sm text-red-600">{state.error}</span> : null}
        {state.ok ? <span className="reveal text-sm font-medium text-leaf-deep">✓ Guardado</span> : null}
      </div>
    </form>
  );
}
