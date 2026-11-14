"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Input, Select, Textarea, filledInputClass } from "@/components/ui";
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
        <Input name="title" defaultValue={defaults.title} required className={filledInputClass} />
      </Field>
      <Field label="Estado">
        <Select name="status" defaultValue={defaults.status} className={filledInputClass}>
          <option value="DRAFT">Borrador</option>
          <option value="ACTIVE">Activo</option>
          <option value="ARCHIVED">Archivado</option>
        </Select>
      </Field>
      <Field label="Notas generales">
        <Textarea name="notes" rows={3} defaultValue={defaults.notes} className={`${filledInputClass} h-auto py-3`} />
      </Field>
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          loading={pending}
          className="rounded-full bg-foreground text-background hover:bg-foreground/85 pressed:bg-foreground/75"
        >
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}
