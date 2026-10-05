"use client";

import { useOptimistic, useTransition } from "react";
import { Switch } from "@/components/primitives/switch";
import { cn } from "@/components/ui";
import { notify } from "@/lib/notify";
import { setBotPausedAction } from "./actions";
import { SwitchRow } from "./settings-ui";

/** "Bot activo" como fila de la lista agrupada. Aplica al instante, como siempre (D19). */
export function BotToggle({ paused }: { paused: boolean }) {
  const [pending, start] = useTransition();
  const [shownPaused, setShownPaused] = useOptimistic(paused);

  return (
    <SwitchRow
      label="Bot activo"
      labelFor="bot-activo"
      descriptionId="bot-activo-desc"
      description={
        <span className={cn(shownPaused && "font-medium text-warning")}>
          {shownPaused
            ? "El bot no está respondiendo ningún mensaje."
            : "Responde solo cuando escriben turno, menú u otra palabra clave."}
        </span>
      }
      control={
        <Switch
          id="bot-activo"
          checked={!shownPaused}
          disabled={pending}
          aria-busy={pending || undefined}
          aria-describedby="bot-activo-desc"
          // `!checked` es `!paused` al tocarlo: misma llamada que antes.
          onCheckedChange={(checked) =>
            start(async () => {
              setShownPaused(!checked);
              try {
                await setBotPausedAction(!checked);
              } catch {
                notify.error();
              }
            })
          }
        />
      }
    />
  );
}
