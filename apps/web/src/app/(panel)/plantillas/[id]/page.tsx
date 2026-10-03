import { notFound } from "next/navigation";
import { getTemplate, listFoods } from "@nutri-bot/db/domain";
import { Card, PageHeader } from "@/components/ui";
import { MealsEditor } from "@/components/meals-editor";
import { initialDayFor } from "@/components/weekly-menu/day-param";
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const [template, foods] = await Promise.all([getTemplate(id), listFoods({ activeOnly: true, source: "SARA2" })]);
  if (!template) notFound();

  const meals = toMealView(template.meals);
  const boundUpdate = updateTemplateAction.bind(null, template.id);

  return (
    <div>
      <PageHeader
        title={template.title}
        description={`Plantilla · ${meals.length} comida${meals.length === 1 ? "" : "s"}`}
        back={{ href: "/plantillas", label: "Volver a plantillas" }}
        action={<DeleteTemplateButton id={template.id} />}
      />

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
          kind="template"
          target={null}
          targetMissingHref={null}
          initialDay={initialDayFor(query.dia, template.meals)}
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
