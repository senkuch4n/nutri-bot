"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Input, Textarea } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
import type { TemplateState } from "../actions";

const initial: TemplateState = { ok: false };

export function TemplateMetaForm({
  action,
  defaults,
}: {
  action: (prev: TemplateState, formData: FormData) => Promise<TemplateState>;
  defaults: { title: string; notes: string };
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  useActionToast(state, { success: "Plantilla guardada" });

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Título">
        <Input name="title" defaultValue={defaults.title} required />
      </Field>
      <Field label="Notas">
        <Textarea name="notes" rows={3} defaultValue={defaults.notes} />
      </Field>
      <Button type="submit" loading={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
      <FormError message={state.error} />
    </form>
  );
}
