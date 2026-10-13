"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ISAK_TEXT } from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { MoreActionsMenu } from "@/components/more-actions-menu";
import { UNDO_TEXT, useDeferredDelete } from "@/lib/deferred-delete";
import { deleteIsakStudyAction } from "../../isak-actions";

/**
 * "…" → "Borrar estudio" (HU-006, HU-017c-3). Se usa en la tarjeta de la consulta y en la página del
 * estudio. Confirmación en palabras simples y borrado diferido con "Deshacer" (el estudio vuelve con sus
 * medidas y su informe: no se borró nada hasta que vence el toast).
 */
export function IsakStudyMoreMenu({
  patientId,
  consultationId,
  entryId,
  redirectTo,
  hasReport = false,
}: {
  patientId: string;
  consultationId: string;
  entryId: string;
  /** Si viene, al programar el borrado se navega ahí (la página del estudio deja de tener sentido). */
  redirectTo?: string;
  /** HU-007: si el estudio tiene informe, la confirmación avisa que también se borra. */
  hasReport?: boolean;
}) {
  const confirm = useConfirm();
  const router = useRouter();
  const deferDelete = useDeferredDelete();

  // Confirmación en el handler, fuera de toda transición (React 19: si no, deadlock).
  async function handleDelete() {
    const ok = await confirm({
      title: ISAK_TEXT.deleteTitle,
      description: hasReport ? ISAK_TEXT.deleteWithReportDescription : ISAK_TEXT.deleteDescription,
      confirmLabel: ISAK_TEXT.deleteLabel,
    });
    if (!ok) return;
    deferDelete({
      key: `isak:${entryId}`,
      message: ISAK_TEXT.deleted,
      undoneMessage: UNDO_TEXT.study.undone,
      commit: () => deleteIsakStudyAction(patientId, consultationId, entryId),
      afterSchedule: redirectTo ? () => router.push(redirectTo) : undefined,
    });
  }

  return (
    <MoreActionsMenu
      label="Más opciones del estudio"
      actions={[{ key: "borrar", label: ISAK_TEXT.deleteLabel, icon: <Trash2 />, destructive: true, onSelect: handleDelete }]}
    />
  );
}
