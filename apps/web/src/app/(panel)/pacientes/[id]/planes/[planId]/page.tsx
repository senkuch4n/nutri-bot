import { notFound } from "next/navigation";
import { prisma } from "@nutri-bot/db";
import { getPlan, listFoods } from "@nutri-bot/db/domain";
import { computeAgeYears, computePlanMicronutrients, sumMacros } from "@nutri-bot/core";
import { getProfessional } from "@/lib/professional";
import { formatDateTime } from "@nutri-bot/core";
import { Card, PageHeader } from "@/components/ui";
import { MacroTotals } from "@/components/macro-totals";
import { MealsEditor } from "@/components/meals-editor";
import { toMealView, toMicronutrientItems } from "@/lib/meal-view";
import { PlanMicronutrientsSection } from "@/components/plan-micronutrients";
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

export const dynamic = "force-dynamic";

const fmtKg = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string; planId: string }>;
}) {
  const { id, planId } = await params;
  const [plan, foods, pro] = await Promise.all([
    getPlan(planId),
    listFoods({ activeOnly: true }),
    getProfessional(),
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
  const totals = sumMacros(meals.flatMap((m) => m.items.map((i) => i.macros).filter((m) => m !== null)));
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
    <div>
      <PageHeader
        title={plan.title}
        description={description}
        back={{ href: `/pacientes/${id}?tab=planes`, label: `Volver a ${patient.name ?? "paciente"}` }}
        action={<DeletePlanButton planId={plan.id} patientId={id} />}
      />

      {/* Totales del plan: quedan a la vista mientras se editan las comidas. */}
      <div className="sticky top-14 z-10 -mx-6 mb-6 bg-background px-6 py-3 lg:top-0 lg:-mx-10 lg:px-10">
        <MacroTotals totals={totals} />
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="space-y-6">
          {plan.meals.length === 0 ? (
            <Card title="Armar con IA">
              <AiPlanForm planId={plan.id} patientId={id} />
            </Card>
          ) : null}

          <MealsEditor
            ownerId={plan.id}
            ownerField="planId"
            meals={meals}
            foods={foods.map((f) => ({ id: f.id, name: f.name, group: f.group, source: f.source }))}
            addMealAction={addPlanMealAction}
            deleteMealAction={deletePlanMealAction}
            addItemAction={addPlanMealItemAction}
            deleteItemAction={deletePlanMealItemAction}
            showMacros
          />
          <PlanMicronutrientsSection result={micronutrients} />
        </div>

        <div className="space-y-6">
          <Card title="Datos del plan">
            <PlanMetaForm
              planId={plan.id}
              defaults={{ title: plan.title, notes: plan.notes ?? "", status: plan.status }}
            />
          </Card>
          <Card title="Enviar al paciente">
            <PlanPdfActions
              planId={plan.id}
              hasPdf={Boolean(plan.pdfGeneratedAt)}
              pdfGeneratedAtLabel={plan.pdfGeneratedAt ? formatDateTime(plan.pdfGeneratedAt, pro.timezone) : null}
              patientPhone={patient.phone}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
