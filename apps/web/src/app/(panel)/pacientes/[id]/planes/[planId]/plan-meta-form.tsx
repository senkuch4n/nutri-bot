"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Input, Select, Textarea } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
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
  useActionToast(state, { success: "Plan guardado" });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="planId" value={planId} />
      <Field label="Título">
        <Input name="title" defaultValue={defaults.title} required />
      </Field>
      <Field label="Estado">
        <Select name="status" defaultValue={defaults.status}>
          <option value="DRAFT">Borrador</option>
          <option value="ACTIVE">Activo</option>
          <option value="ARCHIVED">Archivado</option>
        </Select>
      </Field>
      <Field label="Notas generales">
        <Textarea name="notes" rows={3} defaultValue={defaults.notes} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}
