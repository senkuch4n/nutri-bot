import { ClipboardList } from "lucide-react";
import { prisma } from "@nutri-bot/db";
import { sumMacros } from "@nutri-bot/core";
import { Card, EmptyState } from "@/components/ui";
import { getPortalPatient } from "@/lib/patient-session";
import { toMealView } from "@/lib/meal-view";
import { PortalPlanView } from "./plan-view";

export const dynamic = "force-dynamic";

export default async function PortalPlanPage() {
  const patient = await getPortalPatient();
  if (!patient) return null;

  const plan = await prisma.nutritionPlan.findFirst({
    where: { patientId: patient.id, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    include: {
      meals: {
        orderBy: { order: "asc" },
        include: { items: { orderBy: { order: "asc" }, include: { food: true } } },
      },
    },
  });

  if (!plan) {
    return (
      <Card>
        <EmptyState
          icon={ClipboardList}
          title="Todavía no tenés un plan activo."
          description="Cuando tu nutricionista te lo comparta, lo vas a ver acá."
        />
      </Card>
    );
  }

  const meals = toMealView(plan.meals);
  const totals = sumMacros(meals.flatMap((m) => m.items.map((i) => i.macros).filter((x) => x !== null)));

  return (
    <PortalPlanView
      title={plan.title}
      notes={plan.notes}
      meals={meals}
      totals={totals}
      hasPdf={Boolean(plan.pdfData)}
    />
  );
}
