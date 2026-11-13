"use client";

import { useId, useMemo, useState } from "react";
import { Apple, Search, SearchX } from "lucide-react";
import { foodSearchText, matchesFoodQuery } from "@nutri-bot/core";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { FoodSourceBadge } from "@/components/food-source-badge";
import { Label } from "@/components/primitives/label";
import { Switch } from "@/components/primitives/switch";
import { Badge, Button, Card, EmptyState, Input, Quantity, Select } from "@/components/ui";
import { FOOD_GROUP_LABELS, FOOD_GROUPS, foodGroupLabel, foodGroupShortLabel } from "@/lib/food-groups";

export interface FoodRow {
  id: string;
  name: string;
  group: string;
  source: "SARA2" | "PROPIO";
  kcalPer100: string;
  proteinPer100: string;
  carbsPer100: string;
  fatPer100: string;
  active: boolean;
}

const PAGE_SIZE = 50;
const countFormat = new Intl.NumberFormat("es-AR");

function numericColumn(id: string, header: string, pick: (f: FoodRow) => string): DataTableColumn<FoodRow> {
  return {
    id,
    header,
    numeric: true,
    cell: (f) => <Quantity value={Number(pick(f))} />,
    sortValue: (f) => Number(pick(f)),
  };
}

// Las celdas se definen acá (componente cliente): la página server no le pasa funciones.
const columns: DataTableColumn<FoodRow>[] = [
  {
    id: "nombre",
    header: "Alimento",
    cell: (f) => (
      <>
        <span className="font-medium">{f.name}</span>
        {/* El estado va en texto, no solo con opacidad: no depende del color. */}
        {f.active ? null : (
          <span className="ml-2">
            <Badge tone="neutral">Inactivo</Badge>
          </span>
        )}
      </>
    ),
    sortValue: (f) => f.name,
  },
  {
    id: "fuente",
    header: "Fuente",
    cell: (f) => <FoodSourceBadge source={f.source} />,
    sortValue: (f) => f.source,
    className: "whitespace-nowrap",
  },
  {
    id: "grupo",
    header: "Grupo",
    cell: (f) => (
      <span className="text-muted-foreground" title={foodGroupLabel(f.group)}>
        {foodGroupShortLabel(f.group)}
      </span>
    ),
    sortValue: (f) => foodGroupShortLabel(f.group),
  },
  numericColumn("kcal", "Energía (kcal)", (f) => f.kcalPer100),
  numericColumn("proteinas", "Proteínas (g)", (f) => f.proteinPer100),
  numericColumn("carbos", "Carbohidratos (g)", (f) => f.carbsPer100),
  numericColumn("grasas", "Grasas (g)", (f) => f.fatPer100),
];

export function FoodsList({ foods }: { foods: FoodRow[] }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string>("");
  const [showInactive, setShowInactive] = useState(false);
  const inactiveId = useId();

  // El texto de búsqueda se calcula una sola vez por alimento.
  const searchable = useMemo(() => foods.map((f) => ({ row: f, text: foodSearchText(f.name) })), [foods]);

  const filtered = useMemo(
    () =>
      searchable
        .filter(({ row, text }) => {
          if (!showInactive && !row.active) return false;
          if (group && row.group !== group) return false;
          return matchesFoodQuery(text, q);
        })
        .map(({ row }) => row),
    [searchable, q, group, showInactive],
  );

  function clearFilters() {
    setQ("");
    setGroup("");
  }

  const empty =
    foods.length === 0 ? (
      <EmptyState
        icon={Apple}
        title="Todavía no hay alimentos SARA 2"
        description="Cargá la base SARA 2 para usarla al armar planes y plantillas."
      />
    ) : (
      <EmptyState
        icon={SearchX}
        title="No hay alimentos que coincidan"
        description="Probá con otro nombre u otro grupo."
        action={
          <Button variant="secondary" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        }
      />
    );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label htmlFor="food-search" className="sr-only">
          Buscar alimentos
        </label>
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="food-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar alimento…"
            autoComplete="off"
            spellCheck={false}
            className="pl-9"
          />
        </div>
        <Select
          aria-label="Filtrar por grupo"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="w-full sm:w-64"
        >
          <option value="">Todos los grupos</option>
          {FOOD_GROUPS.map((g) => (
            <option key={g} value={g}>
              {FOOD_GROUP_LABELS[g]}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-2">
          <Switch id={inactiveId} checked={showInactive} onCheckedChange={setShowInactive} />
          <Label htmlFor={inactiveId}>Mostrar inactivos</Label>
        </div>
        <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground" aria-live="polite">
          Mostrando {countFormat.format(filtered.length)} de {countFormat.format(foods.length)} alimentos
        </span>
      </div>

      <Card padding="none">
        <DataTable
          columns={columns}
          rows={filtered}
          getRowId={(f) => f.id}
          rowHref={(f) => `/alimentos/${f.id}`}
          initialSort={{ columnId: "nombre", direction: "asc" }}
          caption="Alimentos, valores cada 100 g"
          maxHeightClassName="max-h-[calc(100vh-17rem)]"
          empty={empty}
          pageSize={PAGE_SIZE}
          pageResetKey={[q, group, showInactive].join("|")}
        />
      </Card>
    </div>
  );
}
