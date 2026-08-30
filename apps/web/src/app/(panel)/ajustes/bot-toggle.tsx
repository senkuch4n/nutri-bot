"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { setBotPausedAction } from "./actions";

export function BotToggle({ paused }: { paused: boolean }) {
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant={paused ? "primary" : "secondary"}
        disabled={pending}
        onClick={() => start(() => setBotPausedAction(!paused))}
      >
        {pending ? "Guardando…" : paused ? "Reactivar el bot" : "Pausar el bot"}
      </Button>
      <span
        className={
          "inline-flex items-center gap-2 text-sm " +
          (paused ? "font-medium text-red-600" : "text-ink-soft")
        }
      >
        <span
          className={"h-2 w-2 rounded-full " + (paused ? "bg-red-500" : "bg-leaf")}
          aria-hidden
        />
        {paused
          ? "El bot no está respondiendo ningún mensaje."
          : "El bot responde solo ante palabras clave (turno, menú…)."}
      </span>
    </div>
  );
}
