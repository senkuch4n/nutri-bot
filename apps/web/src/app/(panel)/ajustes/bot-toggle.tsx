"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { setBotPausedAction } from "./actions";

export function BotToggle({ paused }: { paused: boolean }) {
  const [pending, start] = useTransition();

  return (
    <div className="flex items-center gap-3">
      <Button
        variant={paused ? "primary" : "secondary"}
        disabled={pending}
        onClick={() => start(() => setBotPausedAction(!paused))}
      >
        {pending ? "…" : paused ? "Reactivar el bot" : "Pausar el bot"}
      </Button>
      <span className="text-sm text-slate-500">
        {paused
          ? "El bot NO está respondiendo ningún mensaje."
          : "El bot responde solo cuando alguien escribe una palabra clave (turno, menú…)."}
      </span>
    </div>
  );
}
