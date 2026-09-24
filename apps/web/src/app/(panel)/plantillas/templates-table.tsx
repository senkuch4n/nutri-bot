"use client";

import { DataTable, type DataTableColumn } from "@/components/data-table";

export interface TemplateRow {
  id: string;
  title: string;
  notes: string | null;
}

// Las celdas se definen acá (componente cliente): la página server no le pasa funciones.
const columns: DataTableColumn<TemplateRow>[] = [
  {
    id: "plantilla",
    header: "Plantilla",
    cell: (t) => <span className="font-medium">{t.title}</span>,
    sortValue: (t) => t.title,
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
