"use client";

import { useActionState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
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

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Título">
        <Input name="title" defaultValue={defaults.title} required />
      </Field>
      <Field label="Notas">
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
