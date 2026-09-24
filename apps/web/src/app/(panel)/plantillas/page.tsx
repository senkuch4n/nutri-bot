import { Files } from "lucide-react";
import { listTemplates } from "@nutri-bot/db/domain";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { NewTemplateDialog } from "./new-template-dialog";
import { TemplatesTable } from "./templates-table";

export const dynamic = "force-dynamic";

export default async function PlantillasPage() {
  const templates = await listTemplates();

  return (
    <div>
      <PageHeader
        title="Plantillas"
        description="Planes reutilizables que podés aplicar a cualquier paciente en un click."
        action={<NewTemplateDialog />}
      />

      {templates.length === 0 ? (
        <Card>
          <EmptyState
            icon={Files}
            title="Todavía no creaste ninguna plantilla"
            description="Armá una vez las comidas de un plan tipo y aplicalo a cualquier paciente."
            action={<NewTemplateDialog variant="secondary" />}
          />
        </Card>
      ) : (
        <Card padding="none">
          <TemplatesTable rows={templates.map((t) => ({ id: t.id, title: t.title, notes: t.notes }))} />
        </Card>
      )}
    </div>
  );
}
