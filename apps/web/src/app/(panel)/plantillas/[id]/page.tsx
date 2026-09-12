import { notFound } from "next/navigation";
import Link from "next/link";
import { getTemplate, listFoods } from "@nutri-bot/db/domain";
import { sumMacros } from "@nutri-bot/core";
import { Card, PageHeader, SectionLabel } from "@/components/ui";
import { MealsEditor } from "@/components/meals-editor";
import { toMealView } from "@/lib/meal-view";
import { TemplateMetaForm } from "./template-meta-form";
import { DeleteTemplateButton } from "./delete-template-button";
import {
  updateTemplateAction,
  addTemplateMealAction,
  deleteTemplateMealAction,
  addTemplateMealItemAction,
  deleteTemplateMealItemAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [template, foods] = await Promise.all([getTemplate(id), listFoods({ activeOnly: true })]);
  if (!template) notFound();

  const meals = toMealView(template.meals);
  const totals = sumMacros(meals.flatMap((m) => m.items.map((i) => i.macros).filter((m) => m !== null)));
  const boundUpdate = updateTemplateAction.bind(null, template.id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/plantillas" className="text-sm text-ink-soft transition-colors hover:text-ink">
          ← Volver a plantillas
        </Link>
        <PageHeader title={template.title} action={<DeleteTemplateButton id={template.id} />} />
      </div>

      <Card>
        <SectionLabel>Datos de la plantilla</SectionLabel>
        <TemplateMetaForm action={boundUpdate} defaults={{ title: template.title, notes: template.notes ?? "" }} />
      </Card>

      <div className="grid gap-3 sm:grid-cols-5">
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
        <div className="border border-line bg-paper px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Fibra</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink">{totals.fiber} g</p>
        </div>
      </div>

      <MealsEditor
        ownerId={template.id}
        ownerField="templateId"
        meals={meals}
        foods={foods.map((f) => ({ id: f.id, name: f.name, group: f.group }))}
        addMealAction={addTemplateMealAction}
        deleteMealAction={deleteTemplateMealAction}
        addItemAction={addTemplateMealItemAction}
        deleteItemAction={deleteTemplateMealItemAction}
        showMacros
      />
    </div>
  );
}
