"use client";

import { useMemo, useState } from "react";
import { Search, SearchX, Users } from "lucide-react";
import { normalize } from "@nutri-bot/core";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge, Card, EmptyState, Input } from "@/components/ui";

export interface PatientRow {
  id: string;
  name: string | null;
  phone: string;
  upcoming: number;
}

// Las celdas se definen acá (componente cliente): la página server no le pasa funciones.
const columns: DataTableColumn<PatientRow>[] = [
  {
    id: "nombre",
    header: "Nombre",
    cell: (p) => <span className="font-medium">{p.name ?? "(sin nombre)"}</span>,
    sortValue: (p) => p.name ?? "",
    className: "w-1/2",
  },
  {
    id: "telefono",
    header: "Teléfono",
    cell: (p) => <span className="tabular-nums text-muted-foreground">{p.phone}</span>,
  },
  {
    id: "proximos",
    header: "Próximos turnos",
    numeric: true,
    sortValue: (p) => p.upcoming,
    cell: (p) =>
      p.upcoming > 0 ? (
        <Badge tone="success">
          {p.upcoming} próximo{p.upcoming > 1 ? "s" : ""}
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

export function PatientsList({ patients }: { patients: PatientRow[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const n = normalize(q);
    if (!n) return patients;
    const digits = n.replace(/\D/g, "");
    return patients.filter(
      (p) =>
        normalize(p.name ?? "").includes(n) ||
        (digits.length > 0 && p.phone.includes(digits)),
    );
  }, [q, patients]);

  const empty =
    patients.length === 0 ? (
      <EmptyState
        icon={Users}
        title="Todavía no hay pacientes"
        description="Aparecen acá cuando alguien le escribe al bot por WhatsApp o cuando cargás un turno."
      />
    ) : (
      <EmptyState
        icon={SearchX}
        title={`Sin resultados para «${q}»`}
        description="Probá con otro nombre o con parte del teléfono."
      />
    );

  return (
    <div>
      <div className="mb-4 flex items-center gap-4">
        <label htmlFor="patient-search" className="sr-only">
          Buscar pacientes por nombre o teléfono
        </label>
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="patient-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre o teléfono…"
            className="pl-9"
          />
        </div>
        <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
          {filtered.length} de {patients.length}
        </span>
      </div>

      <Card padding="none">
        <DataTable
          columns={columns}
          rows={filtered}
          getRowId={(p) => p.id}
          rowHref={(p) => `/pacientes/${p.id}`}
          initialSort={{ columnId: "nombre", direction: "asc" }}
          caption="Pacientes"
          maxHeightClassName="max-h-[calc(100vh-15rem)]"
          empty={empty}
        />
      </Card>
    </div>
  );
}
