"use client";

import { useId, useRef, type ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import { Button } from "@/components/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/primitives/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip";
import { cn } from "@/lib/utils";

export interface MoreAction {
  /** Único dentro del menú. */
  key: string;
  label: string;
  /** Ícono ya renderizado (`<Trash2 />`): el menú le pone tamaño y `aria-hidden`. */
  icon?: ReactNode;
  /**
   * Corre al elegir el ítem. Si devuelve una promesa (p. ej. espera la confirmación), al terminar y si
   * el foco quedó en `body` (la fila que abrió el menú pudo desaparecer), vuelve al botón "…".
   */
  onSelect: () => void | Promise<unknown>;
  /** Rojo (acción destructiva; la confirmación va aparte). */
  destructive?: boolean;
  /** Si viene, el ítem queda deshabilitado y el motivo se ve debajo (`aria-describedby`). */
  disabledReason?: string;
}

/**
 * Menú "Más opciones" (HU-017c-3): las acciones destructivas no compiten con las principales. Disparador
 * de 44 px con nombre accesible y tooltip; ítems con ícono y texto.
 */
export function MoreActionsMenu({
  actions,
  label = "Más opciones",
  className,
}: {
  actions: readonly MoreAction[];
  /** Nombre accesible y tooltip del botón. Más específico en listas: "Más opciones de la medición del 24/09". */
  label?: string;
  className?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const baseId = useId();

  function run(action: MoreAction) {
    const result = action.onSelect();
    if (result && typeof (result as Promise<unknown>).then === "function") {
      void (result as Promise<unknown>).finally(() => {
        // Sin foco (body) → al disparador, si sigue en la página.
        requestAnimationFrame(() => {
          const active = document.activeElement;
          const trigger = triggerRef.current;
          if (trigger?.isConnected && (!active || active === document.body)) trigger.focus();
        });
      });
    }
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              ref={triggerRef}
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label={label}
              className={cn("shrink-0 text-muted-foreground hover:text-foreground", className)}
            >
              <Ellipsis strokeWidth={1.75} aria-hidden />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="max-w-xs">
        {actions.map((action) => {
          const reasonId = `${baseId}-${action.key}-motivo`;
          const disabled = Boolean(action.disabledReason);
          return (
            <div key={action.key} role="none">
              <DropdownMenuItem
                variant={action.destructive ? "destructive" : "default"}
                disabled={disabled}
                aria-describedby={disabled ? reasonId : undefined}
                onSelect={() => run(action)}
              >
                {action.icon ? <span aria-hidden className="contents">{action.icon}</span> : null}
                {action.label}
              </DropdownMenuItem>
              {action.disabledReason ? (
                <p id={reasonId} className="px-2.5 pb-1.5 pt-0.5 text-footnote text-muted-foreground">
                  {action.disabledReason}
                </p>
              ) : null}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
