import { notFound } from "next/navigation";
import { getTemplate, listFoods } from "@nutri-bot/db/domain";
import { sumMacros } from "@nutri-bot/core";
import { Card, PageHeader } from "@/components/ui";
import { MacroTotals } from "@/components/macro-totals";
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
    <div>
      <PageHeader
        title={template.title}
        description={`Plantilla · ${meals.length} comida${meals.length === 1 ? "" : "s"}`}
        back={{ href: "/plantillas", label: "Volver a plantillas" }}
        action={<DeleteTemplateButton id={template.id} />}
      />

      {/* Totales de la plantilla: quedan a la vista mientras se editan las comidas. */}
      <div className="sticky top-14 z-10 -mx-6 mb-6 bg-background px-6 py-3 lg:top-0 lg:-mx-10 lg:px-10">
        <MacroTotals totals={totals} />
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <MealsEditor
          ownerId={template.id}
          ownerField="templateId"
          meals={meals}
          foods={foods.map((f) => ({ id: f.id, name: f.name, group: f.group, source: f.source }))}
          addMealAction={addTemplateMealAction}
          deleteMealAction={deleteTemplateMealAction}
          addItemAction={addTemplateMealItemAction}
          deleteItemAction={deleteTemplateMealItemAction}
          showMacros
        />

        <Card
          title="Datos de la plantilla"
          description="El título y las notas se copian al plan cuando la aplicás a un paciente."
        >
          <TemplateMetaForm action={boundUpdate} defaults={{ title: template.title, notes: template.notes ?? "" }} />
        </Card>
      </div>
    </div>
  );
}
