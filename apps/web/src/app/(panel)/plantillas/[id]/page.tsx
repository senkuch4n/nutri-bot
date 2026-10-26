import { notFound } from "next/navigation";
import { getTemplate, listFoods, listMeasuresForPicker } from "@nutri-bot/db/domain";
import { parseTemplateHints } from "@nutri-bot/core";
import { Card, PageHeader } from "@/components/ui";
import { PlanSectionsEditor } from "@/components/plan-sections/plan-sections-editor";
import { TemplateReview } from "@/components/template-import/template-review";
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
  const [template, foods, measures] = await Promise.all([
    getTemplate(id),
    listFoods({ activeOnly: true, source: "SARA2" }),
    listMeasuresForPicker(),
  ]);
  if (!template) notFound();

  const meals = toMealView(template.meals);
  const boundUpdate = updateTemplateAction.bind(null, template.id);
  // HU-020: borrador importado de PDF → bloque de revisión arriba y "Borrador" en el encabezado.
  const isDraft = template.status === "DRAFT";
  const sections = template.sections.map(({ id: sectionId, title, body }) => ({ id: sectionId, title, body }));

  return (
    <div>
      <PageHeader
        title={template.title}
        description={`Plantilla · ${isDraft ? "Borrador · " : ""}${meals.length} comida${meals.length === 1 ? "" : "s"}`}
        back={{ href: "/plantillas", label: "Volver a plantillas" }}
        action={<DeleteTemplateButton id={template.id} />}
      />

      {isDraft ? (
        <TemplateReview
          templateId={template.id}
          hints={parseTemplateHints(template.importHints)}
          meals={template.meals.map((m) => ({ id: m.id, name: m.name, mode: m.mode }))}
          sections={sections.map(({ id: sectionId, title }) => ({ id: sectionId, title }))}
        />
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="space-y-6">
          <MealsEditor
            ownerId={template.id}
            ownerField="templateId"
            meals={meals}
            foods={foods.map((f) => ({ id: f.id, name: f.name, group: f.group, source: f.source, kcalPer100: Number(f.kcalPer100) }))}
            measures={measures}
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
          <PlanSectionsEditor kind="template" ownerId={template.id} sections={sections} />
        </div>

        <Card
          title="Datos de la plantilla"
          description="El título, las notas y los textos se copian al plan cuando la aplicás a un paciente."
        >
          <TemplateMetaForm action={boundUpdate} defaults={{ title: template.title, notes: template.notes ?? "" }} />
        </Card>
      </div>
    </div>
  );
}
