"use client";

import { Button } from "@/components/ui";
import { deletePlanAction } from "./actions";

export function DeletePlanButton({ planId, patientId }: { planId: string; patientId: string }) {
  return (
    <form
      action={async () => {
        if (!confirm("¿Borrar este plan? Esta acción no se puede deshacer.")) return;
        await deletePlanAction(planId, patientId);
      }}
    >
      <Button type="submit" variant="ghost" size="sm">
        Borrar plan
      </Button>
    </form>
  );
}
