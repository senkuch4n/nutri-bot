"use client";

import { useState } from "react";
import { cn } from "@/components/ui";

/**
 * HU-013 (P9): motivo de consulta en la tabla de turnos de la ficha. Truncado en una línea; se ve
 * completo al pasar el mouse (`title`) y al tocarlo (se expande).
 */
export function AppointmentReasonCell({ reason }: { reason: string | null }) {
  const [open, setOpen] = useState(false);
  if (!reason) return <span className="text-muted-foreground">—</span>;
  return (
    <button
      type="button"
      title={reason}
      aria-expanded={open}
      onClick={() => setOpen((o) => !o)}
      className={cn(
        "block max-w-[16rem] rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        open ? "whitespace-pre-wrap break-words" : "truncate",
      )}
    >
      <span className="sr-only">{open ? "Contraer motivo: " : "Ver motivo completo: "}</span>
      {reason}
    </button>
  );
}
