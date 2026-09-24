"use client";

import { useMemo, useState } from "react";
import { Apple, Plus, Search, SearchX } from "lucide-react";
import { normalize } from "@nutri-bot/core";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge, Button, ButtonLink, Card, EmptyState, Input, Quantity, Select } from "@/components/ui";
import { FOOD_GROUP_LABELS, FOOD_GROUPS } from "@/lib/food-groups";

export interface FoodRow {
  id: string;
  name: string;
  group: string;
  kcalPer100: string;
  proteinPer100: string;
  carbsPer100: string;
  fatPer100: string;
  active: boolean;
}

function groupLabel(group: string): string {
  return FOOD_GROUP_LABELS[group as keyof typeof FOOD_GROUP_LABELS] ?? group;
}

function numericColumn(
  id: string,
  header: string,
  pick: (f: FoodRow) => string,
): DataTableColumn<FoodRow> {
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
    id: "grupo",
    header: "Grupo",
    cell: (f) => <span className="text-muted-foreground">{groupLabel(f.group)}</span>,
    sortValue: (f) => groupLabel(f.group),
  },
  numericColumn("kcal", "Energía (kcal)", (f) => f.kcalPer100),
  numericColumn("proteinas", "Proteínas (g)", (f) => f.proteinPer100),
  numericColumn("carbos", "Carbohidratos (g)", (f) => f.carbsPer100),
  numericColumn("grasas", "Grasas (g)", (f) => f.fatPer100),
];

export function FoodsList({ foods }: { foods: FoodRow[] }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string>("");

  const filtered = useMemo(() => {
    const n = normalize(q);
    return foods.filter((f) => {
      if (group && f.group !== group) return false;
      if (n && !normalize(f.name).includes(n)) return false;
      return true;
    });
  }, [foods, q, group]);

  function clearFilters() {
    setQ("");
    setGroup("");
  }

  const empty =
    foods.length === 0 ? (
      <EmptyState
        icon={Apple}
        title="Todavía no hay alimentos"
        description="Cargá el primero para usarlo al armar planes y plantillas."
        action={
          <ButtonLink href="/alimentos/nuevo" variant="secondary">
            <Plus aria-hidden />
            Nuevo alimento
          </ButtonLink>
        }
      />
    ) : (
      <EmptyState
        icon={SearchX}
        title="Ningún alimento coincide con la búsqueda"
        description="Probá con otro nombre o con otro grupo."
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
            className="pl-9"
          />
        </div>
        <Select
          aria-label="Filtrar por grupo"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="w-full sm:w-56"
        >
          <option value="">Todos los grupos</option>
          {FOOD_GROUPS.map((g) => (
            <option key={g} value={g}>
              {FOOD_GROUP_LABELS[g as keyof typeof FOOD_GROUP_LABELS]}
            </option>
          ))}
        </Select>
        <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
          {filtered.length} de {foods.length}
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
          maxHeightClassName="max-h-[calc(100vh-15rem)]"
          empty={empty}
        />
      </Card>
    </div>
  );
}
