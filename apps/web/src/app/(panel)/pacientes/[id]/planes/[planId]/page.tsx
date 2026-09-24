import { notFound } from "next/navigation";
import { prisma } from "@nutri-bot/db";
import { getPlan, listFoods } from "@nutri-bot/db/domain";
import { sumMacros } from "@nutri-bot/core";
import { getProfessional } from "@/lib/professional";
import { formatDateTime } from "@nutri-bot/core";
import { Card, PageHeader, Quantity } from "@/components/ui";
import { MealsEditor } from "@/components/meals-editor";
import { toMealView } from "@/lib/meal-view";
import { calculateAge } from "@/lib/age";
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
  const age = patient.birthDate ? calculateAge(patient.birthDate) : null;
  const latestWeight = latestEntry?.weightKg ? Number(latestEntry.weightKg) : null;

  const description = [
    patient.name ?? patient.phone,
    age !== null ? `${age} años` : null,
    latestWeight !== null ? `${fmtKg.format(latestWeight)} kg` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const totalCells = [
    { label: "Energía", value: totals.kcal, unit: "kcal", decimals: 0 },
    { label: "Proteínas", value: totals.protein, unit: "g", decimals: 1 },
    { label: "Carbohidratos", value: totals.carbs, unit: "g", decimals: 1 },
    { label: "Grasas", value: totals.fat, unit: "g", decimals: 1 },
    { label: "Fibra", value: totals.fiber, unit: "g", decimals: 1 },
  ];

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
        <dl className="grid grid-cols-2 divide-y rounded-lg border sm:grid-cols-5 sm:divide-x sm:divide-y-0">
          {totalCells.map((cell) => (
            <div key={cell.label} className="px-4 py-3">
              <dt className="text-sm text-muted-foreground">{cell.label}</dt>
              <dd className="mt-0.5">
                <Quantity
                  value={cell.value}
                  unit={cell.unit}
                  decimals={cell.decimals}
                  className="text-lg font-semibold"
                />
              </dd>
            </div>
          ))}
        </dl>
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
            foods={foods.map((f) => ({ id: f.id, name: f.name, group: f.group }))}
            addMealAction={addPlanMealAction}
            deleteMealAction={deletePlanMealAction}
            addItemAction={addPlanMealItemAction}
            deleteItemAction={deletePlanMealItemAction}
            showMacros
          />
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
