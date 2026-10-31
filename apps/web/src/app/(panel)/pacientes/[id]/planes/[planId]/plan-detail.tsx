import { notFound } from "next/navigation";
import { MorphDialogTitle } from "@/components/primitives/morph-dialog";
import { prisma } from "@nutri-bot/db";
import { getPlan, getPlanConsultationId, getPlanTarget, listFoods, listMeasuresForPicker } from "@nutri-bot/db/domain";
import { computeAgeYears, computePlanMicronutrients, formatInTimeZone } from "@nutri-bot/core";
import { getProfessional } from "@/lib/professional";
import { formatDateTime } from "@nutri-bot/core";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/components/ui";
import { MealsEditor } from "@/components/meals-editor";
import { initialDayFor } from "@/components/weekly-menu/day-param";
import type { PlanTargetView } from "@/components/weekly-menu/day-target-strip";
import { toMealView, toMicronutrientItems } from "@/lib/meal-view";
import { PlanMicronutrientsSection } from "@/components/plan-micronutrients";
import { PlanSectionsEditor } from "@/components/plan-sections/plan-sections-editor";
import { PlanMetaForm } from "./plan-meta-form";
import { PlanPdfActions } from "./plan-pdf-actions";
import { DeletePlanButton } from "./delete-plan-button";
import { AiPlanForm } from "./ai-plan-form";
import {
  addPlanMealAction,
  deletePlanMealAction,
  addPlanMealItemAction,
  deletePlanMealItemAction,
} from "./actions";

const fmtKg = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

// Paneles de contorno fino, como el contenido de la ficha.
const PANEL = "rounded-[1.75rem] border border-black/[0.05] bg-[#fcfbfd] p-5 sm:p-7";
const PANEL_TITLE = "mb-4 text-title-3 font-medium";

/**
 * Detalle del plan: lo usan la página (`/pacientes/<id>/planes/<planId>`) y el modal de la ficha
 * (`(directorio)/@modal/(.)[id]/planes/[planId]`), donde reemplaza a la ficha en el mismo diálogo.
 * En el modal, "Volver a <paciente>" también queda adentro (Next intercepta el link a la ficha).
 */
export async function PlanDetail({
  id,
  planId,
  dia,
  variant,
}: {
  id: string;
  planId: string;
  /** ?dia= (día del menú semanal). */
  dia: string | string[] | undefined;
  variant: "page" | "modal";
}) {
  const [plan, foods, pro, planTarget, measures] = await Promise.all([
    getPlan(planId),
    listFoods({ activeOnly: true, source: "SARA2" }),
    getProfessional(),
    getPlanTarget(planId),
    listMeasuresForPicker(),
  ]);
  if (!plan || plan.patientId !== id) notFound();

  const [patient, latestEntry] = await Promise.all([
    prisma.patient.findUniqueOrThrow({ where: { id } }),
    prisma.evolutionEntry.findFirst({
      where: { patientId: id, weightKg: { not: null } },
      orderBy: { recordedAt: "desc" },
    }),
  ]);
  const meals = toMealView(plan.meals);
  // HU-018b (D7): objetivo = prescripción de la consulta que indicó el plan, o la más reciente.
  const target: PlanTargetView | null = planTarget
    ? {
        kcal: planTarget.kcal,
        protein: planTarget.protein,
        carbs: planTarget.carbs,
        fat: planTarget.fat,
        sourceLabel: `Objetivo: consulta del ${formatInTimeZone(planTarget.consultedAt, pro.timezone, "dd/MM/yyyy")}`,
      }
    : null;
  // D11: sin objetivo, el aviso lleva a la consulta del plan o, si no tiene, a la pestaña Consultas.
  const planConsultationId = target ? null : await getPlanConsultationId(plan.id);
  const targetMissingHref = target
    ? null
    : planConsultationId
      ? `/pacientes/${id}/consultas/${planConsultationId}`
      : `/pacientes/${id}?tab=consultas`;
  const at = new Date();
  const micronutrients = computePlanMicronutrients(
    toMicronutrientItems(plan.meals), patient, at, pro.timezone,
  );
  const age = patient.birthDate ? computeAgeYears(patient.birthDate, at, pro.timezone) : null;
  const latestWeight = latestEntry?.weightKg ? Number(latestEntry.weightKg) : null;

  const description = [
    patient.name ?? patient.phone,
    age !== null ? `${age} años` : null,
    latestWeight !== null ? `${fmtKg.format(latestWeight)} kg` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    // Acento en negro en todo el plan (botones, links, avisos): globals.css, .ink-accent.
    <div className="ink-accent">
      {/* El diálogo necesita su título (Radix); el visible es el del encabezado. */}
      {variant === "modal" ? <MorphDialogTitle className="sr-only">{plan.title}</MorphDialogTitle> : null}

      {/* Encabezado en el panel tintado de la ficha (referencia 2026-10-31). En el modal deja lugar a la ✕. */}
      <header className={cn("rounded-[1.75rem] bg-[#f6f5f8] p-5 sm:p-7", variant === "modal" && "mr-8")}>
        <Link
          href={`/pacientes/${id}?tab=planes`}
          className="-ml-1 inline-flex items-center gap-0.5 rounded-md text-callout text-muted-foreground press-none transition-colors duration-hover hover:text-foreground pressed:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ChevronLeft className="size-4" strokeWidth={2} aria-hidden />
          {`Volver a ${patient.name ?? "paciente"}`}
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-balance text-title-1 font-medium">{plan.title}</h1>
            <p className="mt-1 text-callout text-foreground">{description}</p>
          </div>
          <DeletePlanButton planId={plan.id} patientId={id} />
        </div>
      </header>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className={cn(PANEL, "space-y-6")}>
          {/* HU-018b: la IA corre si el plan no tiene ítems (las comidas por defecto están vacías). */}
          {!plan.meals.some((meal) => meal.items.length > 0) ? (
            <section>
              <h2 className={PANEL_TITLE}>Armar con IA</h2>
              <AiPlanForm planId={plan.id} patientId={id} />
            </section>
          ) : null}

          <MealsEditor
            ownerId={plan.id}
            ownerField="planId"
            meals={meals}
            foods={foods.map((f) => ({ id: f.id, name: f.name, group: f.group, source: f.source, kcalPer100: Number(f.kcalPer100) }))}
            measures={measures}
            addMealAction={addPlanMealAction}
            deleteMealAction={deletePlanMealAction}
            addItemAction={addPlanMealItemAction}
            deleteItemAction={deletePlanMealItemAction}
            showMacros
            kind="plan"
            target={target}
            targetMissingHref={targetMissingHref}
            initialDay={initialDayFor(dia, plan.meals)}
          />
          <PlanMicronutrientsSection result={micronutrients} />
          {/* HU-020 (D9): textos del plan (recomendaciones, reemplazos…). */}
          <PlanSectionsEditor
            kind="plan"
            ownerId={plan.id}
            sections={plan.sections.map(({ id: sectionId, title, body }) => ({ id: sectionId, title, body }))}
          />
        </div>

        <div className="space-y-4">
          <section className={PANEL}>
            <h2 className={PANEL_TITLE}>Datos del plan</h2>
            <PlanMetaForm
              planId={plan.id}
              defaults={{ title: plan.title, notes: plan.notes ?? "", status: plan.status }}
            />
          </section>
          <section className={PANEL}>
            <h2 className={PANEL_TITLE}>Enviar al paciente</h2>
            <PlanPdfActions
              planId={plan.id}
              hasPdf={Boolean(plan.pdfGeneratedAt)}
              pdfGeneratedAtLabel={plan.pdfGeneratedAt ? formatDateTime(plan.pdfGeneratedAt, pro.timezone) : null}
              patientPhone={patient.phone}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
