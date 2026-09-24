"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { Button, Field, FormError, Input } from "@/components/ui";
import { generateAiPlanAction, type AiPlanState } from "./ai-actions";

const initial: AiPlanState = { ok: false };

export function AiPlanForm({ planId, patientId }: { planId: string; patientId: string }) {
  const [state, action, pending] = useActionState(generateAiPlanAction, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="patientId" value={patientId} />
      <Field
        label="Instrucciones adicionales (opcional)"
        hint='Ej: "bajo en sodio", "alto en proteína", "sin lácteos".'
      >
        <Input name="instructions" placeholder="Sin instrucciones especiales" />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" loading={pending}>
          {pending ? null : <Sparkles aria-hidden />}
          {pending ? "Generando…" : "Generar propuesta con IA"}
        </Button>
      </div>
      <FormError message={state.error} />
      <p className="text-xs text-muted-foreground">
        Usa la ficha clínica y la base de alimentos para armar un borrador. Revisalo y ajustalo antes
        de enviarlo al paciente.
      </p>
    </form>
  );
}
