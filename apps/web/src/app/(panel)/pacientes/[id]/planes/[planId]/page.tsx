import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@nutri-bot/db";
import { getPlan, listFoods } from "@nutri-bot/db/domain";
import { sumMacros } from "@nutri-bot/core";
import { getProfessional } from "@/lib/professional";
import { formatDateTime } from "@nutri-bot/core";
import { Card, PageHeader, SectionLabel } from "@/components/ui";
import { MealsEditor } from "@/components/meals-editor";
import { toMealView } from "@/lib/meal-view";
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

  const patient = await prisma.patient.findUniqueOrThrow({ where: { id } });
  const meals = toMealView(plan.meals);
  const totals = sumMacros(meals.flatMap((m) => m.items.map((i) => i.macros).filter((m) => m !== null)));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/pacientes/${id}`} className="text-sm text-ink-soft transition-colors hover:text-ink">
          ← Volver a {patient.name ?? "paciente"}
        </Link>
        <PageHeader title={plan.title} action={<DeletePlanButton planId={plan.id} patientId={id} />} />
      </div>

      <Card>
        <SectionLabel>Datos del plan</SectionLabel>
        <PlanMetaForm
          planId={plan.id}
          defaults={{ title: plan.title, notes: plan.notes ?? "", status: plan.status }}
        />
      </Card>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="border border-line bg-paper px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Kcal totales</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink">{totals.kcal}</p>
        </div>
        <div className="border border-line bg-paper px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Proteínas</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink">{totals.protein} g</p>
        </div>
        <div className="border border-line bg-paper px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Carbohidratos</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink">{totals.carbs} g</p>
        </div>
        <div className="border border-line bg-paper px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Grasas</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink">{totals.fat} g</p>
        </div>
      </div>

      {plan.meals.length === 0 ? (
        <Card>
          <SectionLabel>Armar con IA</SectionLabel>
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

      <Card>
        <SectionLabel>Enviar al paciente</SectionLabel>
        <PlanPdfActions
          planId={plan.id}
          hasPdf={Boolean(plan.pdfGeneratedAt)}
          pdfGeneratedAtLabel={plan.pdfGeneratedAt ? formatDateTime(plan.pdfGeneratedAt, pro.timezone) : null}
          patientPhone={patient.phone}
        />
      </Card>
    </div>
  );
}
