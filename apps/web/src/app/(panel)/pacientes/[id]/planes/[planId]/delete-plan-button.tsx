"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { useConfirm } from "@/components/confirm";
import { Button } from "@/components/ui";
import { deletePlanAction } from "./actions";

export function DeletePlanButton({ planId, patientId }: { planId: string; patientId: string }) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  // La confirmación se pide en el handler del evento, fuera de toda transición o form action:
  // en React 19 `await confirm()` dentro de una action queda en deadlock (el diálogo nunca se monta).
  async function handleClick() {
    const ok = await confirm({
      title: "¿Borrar este plan?",
      description: "Se borran el plan y todas sus comidas. Esta acción no se puede deshacer.",
      confirmLabel: "Borrar plan",
    });
    if (!ok) return;
    startTransition(async () => {
      await deletePlanAction(planId, patientId);
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
      {pending ? "Borrando…" : "Borrar plan"}
    </Button>
  );
}
