"use client";

import { useActionState, useRef } from "react";
import { Button, Textarea } from "@/components/ui";
import { broadcastMessageAction, type BroadcastState } from "./actions";

const initial: BroadcastState = { ok: false };

export function BroadcastForm({ patientCount }: { patientCount: number }) {
  const [state, action, pending] = useActionState(broadcastMessageAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(e) => {
        const body = new FormData(e.currentTarget).get("body")?.toString().trim();
        if (!body) return;
        const ok = confirm(
          `¿Enviar este mensaje por WhatsApp a los ${patientCount} pacientes cargados? No se puede deshacer.`,
        );
        if (!ok) e.preventDefault();
      }}
      className="space-y-3"
    >
      <Textarea
        name="body"
        rows={3}
        placeholder="Ej: La semana que viene estoy de vacaciones, retomo el lunes 22."
        required
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || patientCount === 0}>
          {pending ? "Enviando…" : `Enviar a los ${patientCount} pacientes`}
        </Button>
        {state.error ? <span className="reveal text-sm text-red-600">{state.error}</span> : null}
        {state.ok ? (
          <span className="reveal text-sm font-medium text-leaf-deep">
            ✓ Encolado para {state.sent} paciente{state.sent === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
    </form>
  );
}
