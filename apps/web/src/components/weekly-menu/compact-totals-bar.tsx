import { formatMacroAmount, formatMacrosLine, type Macros } from "@nutri-bot/core";
import { cn } from "@/lib/utils";

/**
 * Totales en una línea, flotando arriba mientras se scrollea el editor de comidas (cuando el bloque
 * completo ya salió de la vista). Es un duplicado visual del bloque: oculto para lectores de pantalla y
 * sin punteros mientras no se ve. Entra y sale deslizándose (movimiento reducido: solo fundido).
 */
export function CompactTotalsBar({
  visible,
  title,
  totals,
  targetKcal,
}: {
  visible: boolean;
  title: string;
  totals: Macros;
  targetKcal: number | null;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex justify-center transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-opacity",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0",
      )}
    >
      <div className="flex min-w-0 max-w-full items-center gap-3 rounded-full border border-black/[0.06] bg-background/90 px-5 py-2.5 text-callout shadow-[0_8px_24px_rgb(0_0_0/0.08)] backdrop-blur-md">
        <span className="shrink-0 font-medium">{title}</span>
        <span aria-hidden className="h-4 w-px shrink-0 bg-black/10" />
        <span className="min-w-0 truncate tabular-nums text-muted-foreground">
          {formatMacrosLine(totals, { includeFiber: true })}
          {targetKcal !== null ? ` · de ${formatMacroAmount(targetKcal, "kcal")}` : ""}
        </span>
      </div>
    </div>
  );
}
