import { FileDown } from "lucide-react";
import type { Macros } from "@nutri-bot/core";
import type { MealView } from "@/components/meals-editor";
import { MacroTotals } from "@/components/macro-totals";
import { buttonVariants } from "@/components/primitives/button";
import { Card, Quantity } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Plan del paciente en el portal (server-safe). La usan la página del plan y la de prueba. */
export function PortalPlanView({
  title,
  notes,
  meals,
  totals,
  hasPdf,
}: {
  title: string;
  notes: string | null;
  meals: MealView[];
  totals: Macros;
  hasPdf: boolean;
}) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-balance text-2xl font-semibold tracking-tight">{title}</h1>
        {notes ? <p className="mt-2 text-pretty text-sm text-muted-foreground">{notes}</p> : null}
      </header>

      {hasPdf ? (
        // Es una descarga (no una navegación de Next): va con <a>.
        <a
          href="/portal/plan/pdf"
          className={cn(buttonVariants({ variant: "default", size: "lg" }), "w-full sm:w-auto")}
        >
          <FileDown aria-hidden />
          Descargar PDF
        </a>
      ) : null}

      <MacroTotals totals={totals} label="Total del plan" />

      {meals.map((meal) => (
        <Card key={meal.id} title={meal.name}>
          <ul className="-my-3 divide-y">
            {meal.items.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                <span className="min-w-0 break-words">{item.foodName ?? item.customLabel ?? "—"}</span>
                {item.quantityGrams ? (
                  <Quantity
                    value={Number(item.quantityGrams)}
                    unit="g"
                    decimals={1}
                    className="shrink-0 text-muted-foreground"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
