import type { Macros } from "@nutri-bot/core";
import { Quantity } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Franja de los 5 totales de un plan o plantilla (server-safe).
 * Mobile-first: en el celular "Energía" ocupa la fila entera y los macros van en 2 × 2;
 * desde `sm`, las 5 celdas en una fila. Los bordes internos salen de `gap-px bg-border`.
 */
export function MacroTotals({
  totals,
  label = "Total del plan",
  className,
}: {
  totals: Macros;
  label?: string;
  className?: string;
}) {
  const cells = [
    { label: "Energía", value: totals.kcal, unit: "kcal", decimals: 0 },
    { label: "Proteínas", value: totals.protein, unit: "g", decimals: 1 },
    { label: "Carbohidratos", value: totals.carbs, unit: "g", decimals: 1 },
    { label: "Grasas", value: totals.fat, unit: "g", decimals: 1 },
    { label: "Fibra", value: totals.fiber, unit: "g", decimals: 1 },
  ];
  return (
    <dl
      aria-label={label}
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-5",
        className,
      )}
    >
      {cells.map((cell, i) => (
        <div key={cell.label} className={cn("bg-card px-4 py-3", i === 0 && "col-span-2 sm:col-span-1")}>
          <dt className="text-sm text-muted-foreground">{cell.label}</dt>
          <dd className="mt-0.5">
            <Quantity value={cell.value} unit={cell.unit} decimals={cell.decimals} className="text-lg font-semibold" />
          </dd>
        </div>
      ))}
    </dl>
  );
}
