import { notFound } from "next/navigation";
import { prisma } from "@nutri-bot/db";
import { getPlan, getPlanConsultationId, getPlanTarget, listFoods } from "@nutri-bot/db/domain";
import { computeAgeYears, computePlanMicronutrients, formatInTimeZone } from "@nutri-bot/core";
import { getProfessional } from "@/lib/professional";
import { formatDateTime } from "@nutri-bot/core";
import { Card, PageHeader } from "@/components/ui";
import { MealsEditor } from "@/components/meals-editor";
import { initialDayFor } from "@/components/weekly-menu/day-param";
import type { PlanTargetView } from "@/components/weekly-menu/day-target-strip";
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
  searchParams,
}: {
  params: Promise<{ id: string; planId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id, planId } = await params;
  const query = (await searchParams) ?? {};
  const [plan, foods, pro, planTarget] = await Promise.all([
    getPlan(planId),
    listFoods({ activeOnly: true, source: "SARA2" }),
    getProfessional(),
    getPlanTarget(planId),
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
    <div>
      <PageHeader
        title={plan.title}
        description={description}
        back={{ href: `/pacientes/${id}?tab=planes`, label: `Volver a ${patient.name ?? "paciente"}` }}
        action={<DeletePlanButton planId={plan.id} patientId={id} />}
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="space-y-6">
          {/* HU-018b: la IA corre si el plan no tiene ítems (las comidas por defecto están vacías). */}
          {!plan.meals.some((meal) => meal.items.length > 0) ? (
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
            kind="plan"
            target={target}
            targetMissingHref={targetMissingHref}
            initialDay={initialDayFor(query.dia, plan.meals)}
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
