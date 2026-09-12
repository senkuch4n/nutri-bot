"use client";

import { Button } from "@/components/ui";
import { deleteTemplateAction } from "../actions";

export function DeleteTemplateButton({ id }: { id: string }) {
  return (
    <form
      action={async () => {
        if (!confirm("¿Borrar esta plantilla? No afecta los planes ya creados a partir de ella.")) return;
        await deleteTemplateAction(id);
      }}
    >
      <Button type="submit" variant="ghost" size="sm">
        Borrar plantilla
      </Button>
    </form>
  );
}
