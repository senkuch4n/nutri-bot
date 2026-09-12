"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, Textarea } from "@/components/ui";
import { addDiaryEntryAction, type DiaryState } from "./actions";

const initial: DiaryState = { ok: false };

export function DiaryForm() {
  const [state, action, pending] = useActionState(addDiaryEntryAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <Textarea name="note" rows={2} placeholder="¿Qué comiste?" />
      <input
        type="file"
        name="photo"
        accept="image/png,image/jpeg,image/webp"
        className="block w-full text-sm text-ink-soft file:mr-3 file:border-2 file:border-ink file:bg-transparent file:px-3 file:py-1.5 file:text-xs file:font-semibold file:uppercase file:tracking-[0.08em] file:text-ink"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Agregar registro"}
        </Button>
        {state.error ? <span className="reveal text-sm text-red-600">{state.error}</span> : null}
        {state.ok ? <span className="reveal text-sm font-medium text-leaf-deep">✓ Guardado</span> : null}
      </div>
    </form>
  );
}
