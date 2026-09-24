"use client";

import { useState } from "react";
import {
  formatAtwaterCompact,
  formatAtwaterPart,
  formatKcalOneDecimal,
  formatMacroAmount,
  type AtwaterBreakdown,
} from "@nutri-bot/core";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover";

const grams = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

/**
 * Kcal del ítem con el desglose de Atwater de la porción (D11). Se abre al pasar el mouse
 * (solo con mouse) y con clic/toque, así funciona también en pantallas táctiles.
 */
export function KcalBreakdownPopover({
  kcal,
  breakdown,
  itemName,
}: {
  kcal: number;
  breakdown: AtwaterBreakdown;
  itemName: string;
}) {
  const [open, setOpen] = useState(false);
  const handMade = Math.abs(breakdown.totalKcal - kcal) >= 0.1;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Ver de dónde salen las kcal de ${itemName}`}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") setOpen(true);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setOpen(false);
          }}
          className="rounded-sm underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {formatMacroAmount(kcal, "kcal")}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 text-sm"
        side="top"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="font-medium">Porción de {grams.format(breakdown.grams)} g</p>
        <p className="mt-1 tabular-nums">{formatAtwaterCompact(breakdown)}</p>
        <ul className="mt-2 space-y-0.5 text-xs tabular-nums text-muted-foreground">
          {breakdown.parts.map((p) => (
            <li key={p.key}>{formatAtwaterPart(p)}</li>
          ))}
        </ul>
        <p className="mt-2 font-medium tabular-nums">Total {formatKcalOneDecimal(breakdown.totalKcal)}</p>
        {handMade ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Este alimento tiene kcal cargadas a mano que no coinciden con el cálculo por macros.
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
