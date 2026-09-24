"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { useConfirm } from "@/components/confirm";
import { Button } from "@/components/ui";
import { deleteTemplateAction } from "../actions";

export function DeleteTemplateButton({
  id,
  deleteAction = deleteTemplateAction,
}: {
  id: string;
  deleteAction?: (id: string) => Promise<void>;
}) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  // La confirmación se pide en el handler del evento, fuera de toda transición o form action:
  // en React 19 `await confirm()` dentro de una action queda en deadlock (el diálogo nunca se monta).
  async function handleClick() {
    const ok = await confirm({
      title: "¿Borrar esta plantilla?",
      description: "No afecta los planes ya creados a partir de ella. Esta acción no se puede deshacer.",
      confirmLabel: "Borrar plantilla",
    });
    if (!ok) return;
    startTransition(async () => {
      await deleteAction(id);
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      loading={pending}
      onClick={handleClick}
      className="text-destructive hover:bg-destructive-muted hover:text-destructive"
    >
      {pending ? null : <Trash2 aria-hidden />}
      {pending ? "Borrando…" : "Borrar plantilla"}
    </Button>
  );
}
