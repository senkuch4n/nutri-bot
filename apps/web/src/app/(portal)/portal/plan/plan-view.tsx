import { ChevronDown, FileDown } from "lucide-react";
import { PLAN_SECTION_TEXT, type Weekday } from "@nutri-bot/core";
import type { MealView } from "@/components/meals-editor";
import { buttonVariants } from "@/components/primitives/button";
import type { PortalRecipeView } from "@/lib/portal-recipe";
import { cn } from "@/lib/utils";
import { PortalDayView, PortalMealCard } from "./portal-day-view";

/**
 * Plan del paciente en el portal (server-safe). HU-018b: si el plan es semanal, la vista por día
 * (cliente); si no, las comidas una debajo de la otra. HU-017d-3: sin kcal ni macros (D1) y el PDF como
 * botón secundario (D16).
 */
export function PortalPlanView({
  title,
  notes,
  meals,
  hasPdf,
  weekly,
  recipes,
  sections,
}: {
  title: string;
  notes: string | null;
  meals: MealView[];
  hasPdf: boolean;
  /** HU-018b: datos del menú semanal; null o ausente = plan no semanal. */
  weekly?: { today: Weekday; loadedDays: Weekday[] } | null;
  /** HU-018c-2: detalle de las recetas del plan para "Ver receta" (sin macros). */
  recipes?: Record<string, PortalRecipeView>;
  /** HU-020 (D9): textos del plan, cerrados por defecto. */
  sections?: { id: string; title: string; body: string }[];
}) {
  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div>
          <h1 className="text-balance break-words text-title-1">{title}</h1>
          {notes ? <p className="mt-2 text-pretty text-body-lg text-muted-foreground">{notes}</p> : null}
        </div>
        {hasPdf ? (
          // Es una descarga (no una navegación de Next): va con <a>.
          <a
            href="/portal/plan/pdf"
            className={cn(buttonVariants({ variant: "tinted", size: "lg" }), "w-full sm:w-auto")}
          >
            <FileDown aria-hidden />
            Descargar plan (PDF)
          </a>
        ) : null}
      </header>

      {weekly ? (
        <PortalDayView meals={meals} today={weekly.today} loadedDays={weekly.loadedDays} recipes={recipes} />
      ) : (
        <section aria-labelledby="portal-plan-meals">
          {/* Las comidas son h3 (como en la vista por día, bajo el h2 del día): sin saltar niveles. */}
          <h2 id="portal-plan-meals" className="sr-only">Comidas del plan</h2>
          <div className="space-y-4">
            {meals.map((meal) => (
              <PortalMealCard key={meal.id} meal={meal} items={meal.items} recipes={recipes} />
            ))}
          </div>
        </section>
      )}

      {/* HU-020 (D9): textos del plan debajo del menú. */}
      {sections && sections.length > 0 ? (
        <section aria-labelledby="portal-plan-sections" className="space-y-3">
          <h2 id="portal-plan-sections" className="sr-only">
            {PLAN_SECTION_TEXT.cardTitle}
          </h2>
          {sections.map((section) => (
            <details key={section.id} className="group/section rounded-xl bg-card px-4 py-1 shadow-card more-contrast:border more-contrast:border-input">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md py-2 text-headline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 [overflow-wrap:anywhere]">{section.title}</span>
                <ChevronDown
                  className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open/section:rotate-180 motion-reduce:transition-none"
                  aria-hidden
                />
              </summary>
              <p className="mb-3 mt-1 max-w-prose whitespace-pre-line text-pretty text-body leading-relaxed [overflow-wrap:anywhere]">
                {section.body}
              </p>
            </details>
          ))}
        </section>
      ) : null}
    </div>
  );
}
