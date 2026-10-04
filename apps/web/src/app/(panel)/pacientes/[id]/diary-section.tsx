import { NotebookPen } from "lucide-react";
import { PATIENT_SUMMARY_TEXT } from "@nutri-bot/core";
import { Badge, Card, EmptyState } from "@/components/ui";

export interface DiaryEntryRow {
  id: string;
  createdAtLabel: string;
  isRecent: boolean;
  note: string | null;
  hasPhoto: boolean;
}

/** Historial › Diario: lo que la paciente cargó desde el portal. */
export function DiarySection({ entries }: { entries: DiaryEntryRow[] }) {
  return (
    <Card title="Diario alimentario" description="Lo carga el paciente desde el portal.">
      {entries.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="Todavía no cargó nada en su diario"
          description="El paciente lo completa desde el portal."
        />
      ) : (
        <ul className="divide-y">
          {entries.map((e) => (
            <li key={e.id} className="grid gap-3 py-5 first:pt-0 last:pb-0 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-start">
                <p className="text-sm text-muted-foreground">{e.createdAtLabel}</p>
                {/* HU-017c-2: las entradas de las últimas 24 hs se marcan "Nuevo". */}
                {e.isRecent ? <Badge tone="info">{PATIENT_SUMMARY_TEXT.recent}</Badge> : null}
              </div>
              <div className="min-w-0">
                {e.note ? <p className="whitespace-pre-wrap text-sm">{e.note}</p> : null}
                {e.hasPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/diary/${e.id}/photo`}
                    alt="Foto de la comida"
                    loading="lazy"
                    className="mt-3 max-h-64 max-w-full rounded-md border object-cover"
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
