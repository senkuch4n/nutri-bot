import { ClipboardList } from "lucide-react";
import { prisma } from "@nutri-bot/db";
import { RECIPE_ITEM_SELECT } from "@nutri-bot/db/domain";
import { WEEKDAYS, computeWeeklyTotals, weekdayInTimeZone, type Macros, type Weekday } from "@nutri-bot/core";
import { Card, EmptyState } from "@/components/ui";
import { getPortalPatient } from "@/lib/patient-session";
import { getProfessional } from "@/lib/professional";
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
        // HU-018c: el ítem de receta trae su receta (nombre, porción, fuente y foto), como getPlan.
        include: { items: { orderBy: { order: "asc" }, include: { food: true, recipe: { select: RECIPE_ITEM_SELECT } } } },
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
  // HU-018b: plan no semanal → el total de siempre; semanal → total por día y hoy seleccionado.
  const weeklyTotals = computeWeeklyTotals(meals);
  const totals = weeklyTotals.days.MON.macros;
  let weekly: { today: Weekday; dayTotals: Record<Weekday, Macros>; loadedDays: Weekday[] } | null = null;
  if (weeklyTotals.isWeekly) {
    const pro = await getProfessional();
    weekly = {
      today: weekdayInTimeZone(new Date(), pro.timezone),
      dayTotals: Object.fromEntries(WEEKDAYS.map((d) => [d, weeklyTotals.days[d].macros])) as Record<Weekday, Macros>,
      loadedDays: weeklyTotals.loadedDays,
    };
  }

  return (
    <PortalPlanView
      title={plan.title}
      notes={plan.notes}
      meals={meals}
      totals={totals}
      hasPdf={Boolean(plan.pdfData)}
      weekly={weekly}
    />
  );
}
