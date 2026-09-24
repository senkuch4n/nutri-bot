"use client";

import { useMemo, useState } from "react";
import { Search, SearchX, Wallet } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ToggleGroup, ToggleGroupItem } from "@/components/primitives/toggle-group";
import { Badge, Button, EmptyState, Input, Select } from "@/components/ui";

export interface PaymentRow {
  id: string;
  status: "PENDING" | "APPROVED";
  patient: string;
  service: string;
  appointmentLabel: string;
  dateISO: string;
  dateLabel: string;
  kind: "DEPOSIT" | "FULL";
  provider: "manual" | "mercadopago";
  amount: number;
  amountLabel: string;
}

type StatusFilter = "ALL" | "PENDING" | "APPROVED";
type ProviderFilter = "ALL" | "mercadopago" | "manual";
type KindFilter = "ALL" | "DEPOSIT" | "FULL";

const kindLabel = { DEPOSIT: "Seña", FULL: "Total" } as const;
const providerLabel = { mercadopago: "Mercado Pago", manual: "Manual" } as const;

/** Sin tildes ni mayúsculas, para que "Pérez" y "perez" coincidan. */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// LÍMITE RSC: `cell` y `sortValue` son funciones, así que viven acá y no en page.tsx.
const columns: DataTableColumn<PaymentRow>[] = [
  {
    id: "estado",
    header: "Estado",
    cell: (r) =>
      r.status === "PENDING" ? (
        <Badge tone="warning">Pendiente</Badge>
      ) : (
        <Badge tone="success">Acreditado</Badge>
      ),
    sortValue: (r) => r.status,
  },
  {
    id: "paciente",
    header: "Paciente",
    cell: (r) => <span className="font-medium">{r.patient}</span>,
    sortValue: (r) => r.patient,
  },
  {
    id: "servicio",
    header: "Servicio",
    cell: (r) => <span className="text-muted-foreground">{r.service}</span>,
    sortValue: (r) => r.service,
  },
  {
    id: "turno",
    header: "Turno",
    cell: (r) => <span className="whitespace-nowrap tabular-nums">{r.appointmentLabel}</span>,
  },
  {
    id: "fecha",
    header: "Fecha",
    cell: (r) => <span className="whitespace-nowrap tabular-nums">{r.dateLabel}</span>,
    sortValue: (r) => new Date(r.dateISO),
  },
  {
    id: "tipo",
    header: "Tipo",
    cell: (r) => kindLabel[r.kind],
    sortValue: (r) => kindLabel[r.kind],
  },
  {
    id: "medio",
    header: "Medio",
    cell: (r) => <span className="whitespace-nowrap">{providerLabel[r.provider]}</span>,
    sortValue: (r) => providerLabel[r.provider],
  },
  {
    id: "monto",
    header: "Monto",
    numeric: true,
    cell: (r) => <span className="font-medium">{r.amountLabel}</span>,
    sortValue: (r) => r.amount,
  },
];

export function PaymentsTable({ rows }: { rows: PaymentRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [provider, setProvider] = useState<ProviderFilter>("ALL");
  const [kind, setKind] = useState<KindFilter>("ALL");

  const pendingCount = rows.filter((r) => r.status === "PENDING").length;
  const approvedCount = rows.length - pendingCount;

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    return rows.filter((r) => {
      if (status !== "ALL" && r.status !== status) return false;
      if (provider !== "ALL" && r.provider !== provider) return false;
      if (kind !== "ALL" && r.kind !== kind) return false;
      if (q && !fold(r.patient).includes(q) && !fold(r.service).includes(q)) return false;
      return true;
    });
  }, [rows, query, status, provider, kind]);

  const hasFilter = query.trim() !== "" || status !== "ALL" || provider !== "ALL" || kind !== "ALL";

  function clear() {
    setQuery("");
    setStatus("ALL");
    setProvider("ALL");
    setKind("ALL");
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b px-6 py-4">
        <div className="relative w-full sm:max-w-xs">
          <label htmlFor="pagos-buscar" className="sr-only">
            Buscar pagos
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="pagos-buscar"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Paciente o servicio…"
            className="pl-9"
          />
        </div>

        <ToggleGroup
          type="single"
          variant="outline"
          value={status}
          onValueChange={(v) => v && setStatus(v as StatusFilter)}
          aria-label="Estado"
          className="rounded-md border border-input p-0.5 [&>button]:border-0"
        >
          <ToggleGroupItem value="ALL" className="data-[state=on]:font-semibold">
            Todos ({rows.length})
          </ToggleGroupItem>
          <ToggleGroupItem value="PENDING" className="data-[state=on]:font-semibold">
            Pendientes ({pendingCount})
          </ToggleGroupItem>
          <ToggleGroupItem value="APPROVED" className="data-[state=on]:font-semibold">
            Acreditados ({approvedCount})
          </ToggleGroupItem>
        </ToggleGroup>

        <div>
          <label htmlFor="pagos-medio" className="sr-only">
            Medio de pago
          </label>
          <Select
            id="pagos-medio"
            value={provider}
            onChange={(e) => setProvider(e.target.value as ProviderFilter)}
            className="w-auto"
          >
            <option value="ALL">Todos los medios</option>
            <option value="mercadopago">Mercado Pago</option>
            <option value="manual">Manual</option>
          </Select>
        </div>

        <div>
          <label htmlFor="pagos-tipo" className="sr-only">
            Tipo de pago
          </label>
          <Select
            id="pagos-tipo"
            value={kind}
            onChange={(e) => setKind(e.target.value as KindFilter)}
            className="w-auto"
          >
            <option value="ALL">Todos los tipos</option>
            <option value="DEPOSIT">Seña</option>
            <option value="FULL">Total</option>
          </Select>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <p className="text-sm tabular-nums text-muted-foreground">
            {filtered.length} de {rows.length}
          </p>
          {hasFilter ? (
            <Button variant="ghost" size="sm" onClick={clear}>
              Limpiar filtros
            </Button>
          ) : null}
        </div>
      </div>

      <DataTable<PaymentRow>
        columns={columns}
        rows={filtered}
        getRowId={(r) => r.id}
        caption="Pagos"
        maxHeightClassName="max-h-[60vh]"
        initialSort={{ columnId: "fecha", direction: "desc" }}
        empty={
          rows.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Todavía no hay pagos registrados"
              description="Acá aparecen las señas de Mercado Pago y los pagos que registres a mano."
            />
          ) : (
            <EmptyState
              icon={SearchX}
              title="Ningún pago coincide con los filtros"
              action={
                <Button variant="secondary" size="sm" onClick={clear}>
                  Limpiar filtros
                </Button>
              }
            />
          )
        }
      />
    </div>
  );
}
