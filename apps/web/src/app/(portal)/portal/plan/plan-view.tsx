import { FileDown } from "lucide-react";
import type { Macros, Weekday } from "@nutri-bot/core";
import type { MealView } from "@/components/meals-editor";
import { MacroTotals } from "@/components/macro-totals";
import { buttonVariants } from "@/components/primitives/button";
import { Card } from "@/components/ui";
import type { PortalRecipeView } from "@/lib/portal-recipe";
import { cn } from "@/lib/utils";
import { PortalDayView, PortalMealItems } from "./portal-day-view";

/**
 * Plan del paciente en el portal (server-safe). HU-018b: si el plan es semanal, muestra la vista por
 * día (cliente); si no, igual que siempre, con el "Total del plan".
 */
export function PortalPlanView({
  title,
  notes,
  meals,
  totals,
  hasPdf,
  weekly,
  recipes,
}: {
  title: string;
  notes: string | null;
  meals: MealView[];
  totals: Macros;
  hasPdf: boolean;
  /** HU-018b: datos del menú semanal; null o ausente = plan no semanal. */
  weekly?: { today: Weekday; dayTotals: Record<Weekday, Macros>; loadedDays: Weekday[] } | null;
  /** HU-018c-2: detalle de las recetas del plan para "Ver receta" (sin macros). */
  recipes?: Record<string, PortalRecipeView>;
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

      {weekly ? (
        <PortalDayView
          meals={meals}
          today={weekly.today}
          dayTotals={weekly.dayTotals}
          loadedDays={weekly.loadedDays}
          recipes={recipes}
        />
      ) : (
        <>
          <MacroTotals totals={totals} label="Total del plan" />

          {meals.map((meal) => (
            <Card key={meal.id} title={meal.name}>
              <PortalMealItems items={meal.items} recipes={recipes} />
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
