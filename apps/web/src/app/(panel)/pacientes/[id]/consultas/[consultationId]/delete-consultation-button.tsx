"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { CONSULTATION_TEXT } from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { MoreActionsMenu } from "@/components/more-actions-menu";
import { UNDO_TEXT, useDeferredDelete } from "@/lib/deferred-delete";
import { deleteConsultationAction } from "../../consultation-actions";

/**
 * "…" del encabezado de la consulta con "Borrar consulta" (HU-017c-3). Solo se puede borrar sin
 * mediciones, cálculo ni plan (`canDelete`, calculado en el server): si no, el ítem queda deshabilitado
 * con el motivo. Borrado diferido con "Deshacer": se vuelve a la ficha al instante y el toast sigue.
 */
export function ConsultationMoreMenu({
  patientId,
  consultationId,
  canDelete,
  dayLabel,
}: {
  patientId: string;
  consultationId: string;
  canDelete: boolean;
  /** "24/09". */
  dayLabel: string;
}) {
  const confirm = useConfirm();
  const router = useRouter();
  const deferDelete = useDeferredDelete();
  const consultationHref = `/pacientes/${patientId}/consultas/${consultationId}`;

  // Confirmación en el handler, fuera de toda transición (React 19: si no, deadlock).
  async function handleDelete() {
    const ok = await confirm({
      title: UNDO_TEXT.consultation.confirmTitle,
      description: UNDO_TEXT.consultation.confirmDescription(dayLabel),
      confirmLabel: UNDO_TEXT.consultation.confirmLabel,
    });
    if (!ok) return;
    deferDelete({
      key: `consultation:${consultationId}`,
      message: UNDO_TEXT.consultation.deleted,
      undoneMessage: UNDO_TEXT.consultation.undone,
      undoneAction: { label: UNDO_TEXT.open, href: consultationHref },
      commit: () => deleteConsultationAction(patientId, consultationId),
      afterSchedule: () => router.push(`/pacientes/${patientId}?tab=consultas`),
    });
  }

  return (
    <MoreActionsMenu
      actions={[
        {
          key: "borrar",
          label: UNDO_TEXT.consultation.confirmLabel,
          icon: <Trash2 />,
          destructive: true,
          disabledReason: canDelete ? undefined : `${CONSULTATION_TEXT.notDeletable}.`,
          onSelect: handleDelete,
        },
      ]}
    />
  );
}
