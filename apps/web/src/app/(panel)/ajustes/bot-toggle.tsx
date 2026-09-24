"use client";

import { useTransition } from "react";
import { Label } from "@/components/primitives/label";
import { Switch } from "@/components/primitives/switch";
import { cn } from "@/components/ui";
import { setBotPausedAction } from "./actions";

export function BotToggle({ paused }: { paused: boolean }) {
  const [pending, start] = useTransition();

  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <Label htmlFor="bot-activo" className="text-sm font-medium">
          Bot activo
        </Label>
        <p
          id="bot-activo-desc"
          className={cn("mt-1 text-sm", paused ? "font-medium text-warning" : "text-muted-foreground")}
        >
          {paused
            ? "El bot no está respondiendo ningún mensaje."
            : "El bot responde solo ante palabras clave (turno, menú…)."}
        </p>
      </div>
      <Switch
        id="bot-activo"
        checked={!paused}
        disabled={pending}
        aria-busy={pending || undefined}
        aria-describedby="bot-activo-desc"
        // `!checked` es `!paused` al tocarlo: misma llamada que antes.
        onCheckedChange={(checked) => start(() => setBotPausedAction(!checked))}
      />
    </div>
  );
}
