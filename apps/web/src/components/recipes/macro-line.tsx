import type { Macros } from "@nutri-bot/core";
import { chartPalette } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";

// HU-018a: "● P 23,9 g · ● C 31,1 g · ● G 1,9 g". El color nunca va solo: siempre con la letra.

const grams = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

const PARTS = [
  { key: "protein", short: "P", long: "Proteínas", color: chartPalette.macro.protein },
  { key: "carbs", short: "C", long: "Carbohidratos", color: chartPalette.macro.carbs },
  { key: "fat", short: "G", long: "Grasas", color: chartPalette.macro.fat },
] as const;

export function MacroLine({ macros, size = "footnote" }: { macros: Macros; size?: "footnote" | "callout" }) {
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums text-muted-foreground",
        size === "footnote" ? "text-footnote" : "text-callout",
      )}
    >
      {PARTS.map((p, i) => (
        <span key={p.key} className="inline-flex items-center gap-1 whitespace-nowrap">
          {i > 0 ? (
            <span aria-hidden className="mr-1">
              ·
            </span>
          ) : null}
          <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span aria-hidden>{p.short}</span>
          <span className="sr-only">{p.long}</span>
          <span>{grams.format(macros[p.key])}{" "}g</span>
        </span>
      ))}
    </p>
  );
}
