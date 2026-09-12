import Link from "next/link";
import { listTemplates } from "@nutri-bot/db/domain";
import { Card, PageHeader } from "@/components/ui";
import { NewTemplateForm } from "./new-template-form";

export const dynamic = "force-dynamic";

export default async function PlantillasPage() {
  const templates = await listTemplates();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plantillas"
        description="Planes reutilizables que podés aplicar a cualquier paciente en un click."
      />

      <Card>
        <NewTemplateForm />
      </Card>

      {templates.length === 0 ? (
        <div className="border border-dashed border-line bg-paper px-6 py-12 text-center text-sm text-ink-soft">
          Todavía no creaste ninguna plantilla.
        </div>
      ) : (
        <ul className="divide-y divide-line border border-line bg-paper">
          {templates.map((t) => (
            <li key={t.id}>
              <Link
                href={`/plantillas/${t.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-mint"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{t.title}</p>
                  {t.notes ? <p className="truncate text-xs text-ink-soft">{t.notes}</p> : null}
                </div>
                <span aria-hidden className="shrink-0 text-ink-faint">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
