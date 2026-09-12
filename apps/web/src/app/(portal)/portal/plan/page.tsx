import Link from "next/link";
import { prisma } from "@nutri-bot/db";
import { sumMacros } from "@nutri-bot/core";
import { Card, SectionLabel } from "@/components/ui";
import { getPortalPatient } from "@/lib/patient-session";
import { toMealView } from "@/lib/meal-view";

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
      <div>
        <Link href="/portal" className="text-sm text-ink-soft transition-colors hover:text-ink">
          ← Volver
        </Link>
        <p className="mt-6 text-sm text-ink-faint">Todavía no tenés un plan activo.</p>
      </div>
    );
  }

  const meals = toMealView(plan.meals);
  const totals = sumMacros(meals.flatMap((m) => m.items.map((i) => i.macros).filter((x) => x !== null)));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal" className="text-sm text-ink-soft transition-colors hover:text-ink">
          ← Volver
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">{plan.title}</h1>
        {plan.notes ? <p className="mt-1 text-sm text-ink-soft">{plan.notes}</p> : null}
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="border border-line bg-paper px-2 py-3">
          <p className="text-[10px] uppercase tracking-wide text-ink-faint">Kcal</p>
          <p className="font-display text-lg font-bold text-ink">{totals.kcal}</p>
        </div>
        <div className="border border-line bg-paper px-2 py-3">
          <p className="text-[10px] uppercase tracking-wide text-ink-faint">Prot.</p>
          <p className="font-display text-lg font-bold text-ink">{totals.protein}g</p>
        </div>
        <div className="border border-line bg-paper px-2 py-3">
          <p className="text-[10px] uppercase tracking-wide text-ink-faint">Carb.</p>
          <p className="font-display text-lg font-bold text-ink">{totals.carbs}g</p>
        </div>
        <div className="border border-line bg-paper px-2 py-3">
          <p className="text-[10px] uppercase tracking-wide text-ink-faint">Grasas</p>
          <p className="font-display text-lg font-bold text-ink">{totals.fat}g</p>
        </div>
      </div>

      {meals.map((meal) => (
        <Card key={meal.id}>
          <SectionLabel>{meal.name}</SectionLabel>
          <ul className="divide-y divide-line text-sm">
            {meal.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-ink">{item.foodName ?? item.customLabel ?? "—"}</span>
                {item.quantityGrams ? (
                  <span className="text-ink-soft">{item.quantityGrams} g</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {plan.pdfData ? (
        <a
          href="/portal/plan/pdf"
          className="press inline-flex items-center gap-2 border-2 border-ink px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-ink hover:text-white"
        >
          Descargar PDF
        </a>
      ) : null}
    </div>
  );
}
