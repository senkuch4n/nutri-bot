"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Input } from "@/components/ui";
import { createTemplateAction, type TemplateState } from "./actions";

const initial: TemplateState = { ok: false };

export function NewTemplateForm({ onCancel }: { onCancel?: () => void }) {
  const [state, action, pending] = useActionState(createTemplateAction, initial);

  return (
    <form action={action} className="space-y-4">
      <Field label="Nombre">
        <Input name="title" placeholder="Ej: Plan bajo en sodio" required />
      </Field>
      <input type="hidden" name="notes" value="" />
      <FormError message={state.error} />
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" loading={pending}>
          {pending ? "Creando…" : "Crear plantilla"}
        </Button>
      </div>
    </form>
  );
}
