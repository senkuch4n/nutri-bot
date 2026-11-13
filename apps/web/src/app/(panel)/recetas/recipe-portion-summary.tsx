"use client";

import {
  compareWithPublished,
  formatAtwaterCompact,
  formatMacroAmount,
  recipeMacroWarnings,
  type Macros,
  type RecipeMacroResult,
} from "@nutri-bot/core";
import type { RecipeDetail } from "@nutri-bot/db/domain";
import { KcalBreakdownPopover } from "@/components/kcal-breakdown-popover";
import { Alert } from "@/components/ui";
import { chartPalette } from "@/lib/design-tokens";

// HU-018a: "1 porción aporta" (aside del editor). Se recalcula en cada cambio con computeRecipeMacros.
// Sin rendimiento muestra el total de la receta y el aviso para cargarlo.

const grams = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

const ROWS: { key: keyof Macros; label: string; color: string | null }[] = [
  { key: "protein", label: "Proteínas", color: chartPalette.macro.protein },
  { key: "carbs", label: "Carbohidratos", color: chartPalette.macro.carbs },
  { key: "fat", label: "Grasas", color: chartPalette.macro.fat },
  { key: "fiber", label: "Fibra", color: null },
];

export function RecipePortionSummary({
  result,
  yieldPortions,
  published,
  recipeName,
}: {
  result: RecipeMacroResult;
  yieldPortions: number | null;
  published: RecipeDetail["published"];
  recipeName: string;
}) {
  const macros = result.perPortion ?? result.total;
  const warnings = recipeMacroWarnings(result, yieldPortions);
  const comparison = compareWithPublished(result.perPortion, published);
  const atwater = result.atwaterPerPortion;

  return (
    <section aria-labelledby="portion-summary-title" className="rounded-xl bg-card p-5 shadow-card more-contrast:border more-contrast:border-input">
      <h2 id="portion-summary-title" className="text-headline">
        {result.perPortion ? "1 porción aporta" : "La receta completa aporta"}
      </h2>
      <p className="mt-2 text-metric-md tabular-nums" aria-live="polite">
        {atwater && atwater.grams > 0 ? (
          <KcalBreakdownPopover kcal={macros.kcal} breakdown={atwater} itemName={recipeName || "la receta"} />
        ) : (
          formatMacroAmount(macros.kcal, "kcal")
        )}
      </p>
      <dl className="mt-3 space-y-1.5 text-callout">
        {ROWS.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: r.color ?? "transparent" }}
              />
              {r.label}
            </dt>
            <dd className="tabular-nums">{grams.format(macros[r.key])}{" "}g</dd>
          </div>
        ))}
      </dl>
      {atwater ? (
        <p className="mt-3 text-footnote tabular-nums text-muted-foreground">{formatAtwaterCompact(atwater)}</p>
      ) : null}

      {warnings.length > 0 ? (
        <Alert tone="warning" className="mt-4">
          <ul className="space-y-1">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {published?.kcal ? (
        <div className="mt-4 space-y-2 border-t pt-3 text-callout">
          <p className="text-muted-foreground tabular-nums">
            Según el recetario: {formatMacroAmount(published.kcal, "kcal")}
            {published.portionText ? ` (${published.portionText})` : ""}
          </p>
          {comparison.message ? <Alert tone="warning">{comparison.message}</Alert> : null}
        </div>
      ) : null}
    </section>
  );
}
