"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";
import { Send } from "lucide-react";
import { useConfirm } from "@/components/confirm";
import { Button, FormError, Textarea } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
import { broadcastMessageAction, type BroadcastState } from "./actions";

const initial: BroadcastState = { ok: false };
type BroadcastAction = (prev: BroadcastState, formData: FormData) => Promise<BroadcastState>;

/**
 * El `<form>` no tiene `action`: el envío se despacha a mano después de confirmar. El `await` del
 * diálogo corre en el handler del evento, fuera de toda transición (si se hiciera dentro de
 * `<form action>` o de `startTransition`, en React 19 el diálogo nunca se monta; ver `useConfirm`).
 * `sendAction` existe solo para la página de prueba: en producción nunca se pasa.
 */
export function BroadcastForm({
  patientCount,
  sendAction = broadcastMessageAction,
}: {
  patientCount: number;
  sendAction?: BroadcastAction;
}) {
  const [state, dispatch, pending] = useActionState(sendAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const confirm = useConfirm();

  useActionToast(state, {
    success: state.ok ? `Encolado para ${state.sent} paciente${state.sent === 1 ? "" : "s"}` : undefined,
  });
  // Solo si salió bien: si falla, lo escrito se conserva (Gherkin "Error al guardar").
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); // 1. SIEMPRE y antes de cualquier await
    const formData = new FormData(e.currentTarget); // 2. sincrónico: currentTarget es null después del await
    const body = formData.get("body")?.toString().trim();
    if (body) {
      // 3. igual que antes: sin texto no se confirma y la action devuelve su error
      const ok = await confirm({
        // 4. en un handler de evento, fuera de toda transición
        title: "¿Enviar este comunicado?",
        description: `Se va a mandar por WhatsApp a los ${patientCount} pacientes cargados. No se puede deshacer.`,
        confirmLabel: `Enviar a ${patientCount} pacientes`,
      });
      if (!ok) return; // Cancelar o Escape: no pasa nada
    }
    startTransition(() => dispatch(formData)); // 5. recién acá la action, dentro de una transición
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <Textarea
        name="body"
        rows={3}
        required
        aria-label="Mensaje del comunicado"
        placeholder="Ej: La semana que viene estoy de vacaciones, retomo el lunes 22."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Se envía a {patientCount} pacientes por WhatsApp.</p>
        <Button type="submit" loading={pending} disabled={patientCount === 0}>
          {pending ? (
            "Enviando…"
          ) : (
            <>
              <Send aria-hidden />
              Enviar a los {patientCount} pacientes
            </>
          )}
        </Button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}
