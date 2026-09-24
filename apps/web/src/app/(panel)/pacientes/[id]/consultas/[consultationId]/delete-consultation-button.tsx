"use client";

import { useId, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { CONSULTATION_TEXT } from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { Button } from "@/components/ui";
import { notify } from "@/lib/notify";
import { deleteConsultationAction } from "../../consultation-actions";

/** Borrado a mano: solo sin mediciones y sin plan (`canDelete`, calculado en el server). */
export function DeleteConsultationButton({
  patientId,
  consultationId,
  canDelete,
}: {
  patientId: string;
  consultationId: string;
  canDelete: boolean;
}) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const helpId = useId();

  // Confirmación en el handler, fuera de toda transición (React 19: si no, deadlock).
  async function handleClick() {
    const ok = await confirm({
      title: "¿Eliminar esta consulta?",
      description: "Se borran sus notas. No se puede deshacer.",
      confirmLabel: "Eliminar consulta",
    });
    if (!ok) return;
    startTransition(async () => {
      // Si sale bien, la action redirige a la pestaña Consultas.
      const res = await deleteConsultationAction(patientId, consultationId);
      if (res && !res.ok) notify.error(res.error);
    });
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="danger"
        size="sm"
        loading={pending}
        disabled={!canDelete}
        aria-describedby={canDelete ? undefined : helpId}
        onClick={handleClick}
      >
        {pending ? null : <Trash2 aria-hidden />}
        {pending ? "Eliminando…" : "Eliminar consulta"}
      </Button>
      {canDelete ? null : (
        <p id={helpId} className="text-xs text-muted-foreground">
          {CONSULTATION_TEXT.notDeletable}.
        </p>
      )}
    </div>
  );
}
