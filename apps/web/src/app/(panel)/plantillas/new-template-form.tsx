"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { createTemplateAction, type TemplateState } from "./actions";

const initial: TemplateState = { ok: false };

export function NewTemplateForm() {
  const [state, action, pending] = useActionState(createTemplateAction, initial);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <Field label="Nueva plantilla">
        <Input name="title" placeholder="Ej: Plan bajo en sodio" required className="w-64" />
      </Field>
      <input type="hidden" name="notes" value="" />
      <Button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Crear plantilla"}
      </Button>
      {state.error ? <span className="reveal text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}
