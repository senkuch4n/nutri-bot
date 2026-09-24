"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { useConfirm } from "@/components/confirm";
import { Button } from "@/components/ui";

/**
 * "Borrar comida" con confirmación. La confirmación se pide en el `onSubmit`, fuera de la
 * transición (ver JSDoc de `useConfirm`), y recién con `true` se llama a la action.
 */
export function DeleteMealButton({
  mealId,
  mealName,
  itemCount,
  ownerField,
  ownerId,
  deleteMealAction,
}: {
  mealId: string;
  mealName: string;
  itemCount: number;
  ownerField: string;
  ownerId: string;
  deleteMealAction: (formData: FormData) => Promise<void>;
}) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const ok = await confirm({
      title: `¿Borrar la comida «${mealName}»?`,
      description:
        itemCount > 0
          ? `Se borran también sus ${itemCount} alimento${itemCount === 1 ? "" : "s"}. No se puede deshacer.`
          : "No se puede deshacer.",
      confirmLabel: "Borrar comida",
    });
    if (!ok) return;
    startTransition(() => deleteMealAction(formData));
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="hidden" name="mealId" value={mealId} />
      <input type="hidden" name={ownerField} value={ownerId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        loading={pending}
        aria-label={`Borrar comida ${mealName}`}
        className="text-destructive hover:bg-destructive-muted hover:text-destructive"
      >
        {pending ? null : <Trash2 aria-hidden />}
        {pending ? "Borrando…" : "Borrar comida"}
      </Button>
    </form>
  );
}
