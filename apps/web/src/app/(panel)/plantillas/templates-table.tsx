"use client";

import { PLAN_IMPORT_TEXT } from "@nutri-bot/core";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui";

export interface TemplateRow {
  id: string;
  title: string;
  notes: string | null;
  /** HU-020. */
  status: "DRAFT" | "PUBLISHED";
  origin: "MANUAL" | "IMPORT";
  reviewed: boolean;
}

/** HU-020: "Importada de PDF · sin revisar / · revisada" (publicada: solo "Importada de PDF"). */
function importedLabel(t: TemplateRow): string | null {
  if (t.origin !== "IMPORT") return null;
  if (t.status === "PUBLISHED") return PLAN_IMPORT_TEXT.importedPublished;
  return t.reviewed ? PLAN_IMPORT_TEXT.importedReviewed : PLAN_IMPORT_TEXT.importedUnreviewed;
}

// Las celdas se definen acá (componente cliente): la página server no le pasa funciones.
const columns: DataTableColumn<TemplateRow>[] = [
  {
    id: "plantilla",
    header: "Plantilla",
    cell: (t) => {
      const imported = importedLabel(t);
      return (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{t.title}</span>
            {t.status === "DRAFT" ? <Badge tone="warning">{PLAN_IMPORT_TEXT.draftChip}</Badge> : null}
          </div>
          {imported ? <p className="mt-0.5 text-footnote text-muted-foreground">{imported}</p> : null}
        </div>
      );
    },
    // HU-020: borradores arriba.
    sortValue: (t) => `${t.status === "DRAFT" ? 0 : 1} ${t.title}`,
    className: "w-1/3",
  },
  {
    id: "notas",
    header: "Notas",
    cell: (t) =>
      t.notes ? (
        <span className="line-clamp-1 text-muted-foreground">{t.notes}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

export function TemplatesTable({ rows }: { rows: TemplateRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowId={(t) => t.id}
      rowHref={(t) => `/plantillas/${t.id}`}
      initialSort={{ columnId: "plantilla", direction: "asc" }}
      caption="Plantillas"
      maxHeightClassName="max-h-[calc(100vh-15rem)]"
    />
  );
}
