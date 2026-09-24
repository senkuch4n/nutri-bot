"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ISAK_TEXT } from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { Button } from "@/components/ui";
import { notify } from "@/lib/notify";
import { deleteIsakStudyAction } from "../../isak-actions";

/** "Borrar estudio" (HU-006). Se usa en la tarjeta de la consulta y en la página del estudio. */
export function DeleteIsakStudyButton({
  patientId,
  consultationId,
  entryId,
  redirectTo,
  hasReport = false,
}: {
  patientId: string;
  consultationId: string;
  entryId: string;
  /** Si viene, al borrar bien se navega ahí (la página del estudio deja de existir). */
  redirectTo?: string;
  /** HU-007: si el estudio tiene informe, el confirm avisa que también se borra. */
  hasReport?: boolean;
}) {
  const confirm = useConfirm();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Confirmación en el handler, fuera de toda transición (React 19: si no, deadlock).
  async function handleClick() {
    const ok = await confirm({
      title: ISAK_TEXT.deleteTitle,
      description: hasReport ? ISAK_TEXT.deleteWithReportDescription : ISAK_TEXT.deleteDescription,
      confirmLabel: ISAK_TEXT.deleteLabel,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteIsakStudyAction(patientId, consultationId, entryId);
      if (res.ok) {
        notify.saved(ISAK_TEXT.deleted);
        if (redirectTo) router.push(redirectTo);
      } else {
        notify.error(res.error);
      }
    });
  }

  return (
    <Button type="button" variant="danger" size="sm" loading={pending} onClick={handleClick}>
      {pending ? null : <Trash2 aria-hidden />}
      {ISAK_TEXT.deleteLabel}
    </Button>
  );
}
