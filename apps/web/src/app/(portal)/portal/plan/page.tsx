import { ClipboardList } from "lucide-react";
import { prisma } from "@nutri-bot/db";
import { RECIPE_ITEM_SELECT, listPlanRecipePreviews } from "@nutri-bot/db/domain";
import { computeWeeklyTotals, weekdayInTimeZone, type Weekday } from "@nutri-bot/core";
import { Card, EmptyState } from "@/components/ui";
import { getPortalSession } from "@/lib/patient-session";
import { getTenantProfessional } from "@/lib/professional";
import { toMealView } from "@/lib/meal-view";
import { portalMealsForClient, toPortalRecipeMap } from "@/lib/portal-recipe";
import { PortalPlanView } from "./plan-view";

export const dynamic = "force-dynamic";

export default async function PortalPlanPage() {
  // HU-033 (025c): el plan es del paciente de la sesión en el consultorio de la sesión.
  const session = await getPortalSession();
  if (!session) return null;
  const { patient } = session;
  const tenant = { tenantId: session.tenantId };

  const plan = await prisma.nutritionPlan.findFirst({
    where: { patientId: patient.id, tenantId: tenant.tenantId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    include: {
      meals: {
        orderBy: { order: "asc" },
        // HU-018c: el ítem de receta trae su receta (nombre, porción, fuente y foto), como getPlan.
        include: { items: { orderBy: { order: "asc" }, include: { food: true, recipe: { select: RECIPE_ITEM_SELECT } } } },
      },
      // HU-020 (D9): textos del plan (recomendaciones, reemplazos…).
      sections: { orderBy: { order: "asc" }, select: { id: true, title: true, body: true } },
    },
  });

  if (!plan) {
    return (
      <Card>
        <EmptyState
          icon={ClipboardList}
          title="Todavía no tenés un plan."
          description="Cuando tu nutricionista te lo comparta, lo vas a ver acá."
        />
      </Card>
    );
  }

  const meals = toMealView(plan.meals);
  // HU-018b: semanal → hoy seleccionado y los días cargados. HU-017d-3 (D1, Q10): los totales ya no
  // viajan al navegador; computeWeeklyTotals sigue diciendo si el plan es semanal y qué días tienen algo.
  const weeklyTotals = computeWeeklyTotals(meals);
  let weekly: { today: Weekday; loadedDays: Weekday[] } | null = null;
  if (weeklyTotals.isWeekly) {
    const pro = await getTenantProfessional(tenant.tenantId);
    weekly = {
      today: weekdayInTimeZone(new Date(), pro.timezone),
      loadedDays: weeklyTotals.loadedDays,
    };
  }

  // HU-018c-2 (SDD 7.6): el detalle de las recetas del plan ACTIVE del paciente (solo esas: el plan se
  // buscó por patientId y status ACTIVE), sin macros. Los ítems de receta viajan sin macros.
  const recipes = toPortalRecipeMap(await listPlanRecipePreviews(tenant, plan.id));

  return (
    <PortalPlanView
      title={plan.title}
      notes={plan.notes}
      meals={portalMealsForClient(meals)}
      recipes={recipes}
      hasPdf={Boolean(plan.pdfData)}
      weekly={weekly}
      sections={plan.sections}
    />
  );
}
