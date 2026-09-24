"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, Field, FormError, Textarea } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
import { addDiaryEntryAction, type DiaryState } from "./actions";

const initial: DiaryState = { ok: false };

export function DiaryForm({
  submitAction,
}: {
  /** Solo para la página de prueba; en producción siempre `addDiaryEntryAction`. */
  submitAction?: (prev: DiaryState, formData: FormData) => Promise<DiaryState>;
}) {
  const [state, action, pending] = useActionState(submitAction ?? addDiaryEntryAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  useActionToast(state, { success: "Registro guardado" });

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <Field label="¿Qué comiste?">
        <Textarea name="note" rows={3} placeholder="Ej: Almuerzo: ensalada de lentejas y una fruta." />
      </Field>
      <Field label="Foto (opcional)" hint="JPG, PNG o WEBP, hasta 3 MB.">
        <input
          type="file"
          name="photo"
          accept="image/png,image/jpeg,image/webp"
          className="block w-full rounded-md text-sm text-muted-foreground file:mr-3 file:h-11 file:cursor-pointer file:rounded-md file:border file:border-solid file:border-input file:bg-background file:px-4 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Field>
      <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
        {pending ? "Guardando…" : "Agregar registro"}
      </Button>
      <FormError message={state.error} />
    </form>
  );
}
