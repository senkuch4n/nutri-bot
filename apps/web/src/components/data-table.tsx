"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/primitives/table";
import { Button, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** A la derecha + tabular-nums (th y td). */
  numeric?: boolean;
  /** Si está, la columna se puede ordenar. */
  sortValue?: (row: T) => string | number | Date | null;
  /** Ancho, etc. */
  className?: string;
};

type SortState = { columnId: string; direction: "asc" | "desc" };

const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

function compareValues(a: string | number | Date | null, b: string | number | Date | null): number {
  // null siempre al final, independientemente de la dirección
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

const INTERACTIVE = "a, button, input, select, textarea, label";

/**
 * Tabla de datos con orden en cliente, encabezado fijo opcional y fila clickeable.
 * LÍMITE RSC: `cell`, `sortValue` y `rowHref` son funciones, así que solo se usa desde
 * componentes cliente. Desde un server component, usar los primitivos de @/components/primitives/table.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  rowHref,
  empty,
  maxHeightClassName,
  initialSort,
  caption,
  pageSize,
  pageResetKey,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  rowHref?: (row: T) => string;
  empty?: ReactNode;
  maxHeightClassName?: string;
  initialSort?: SortState;
  caption?: string;
  /** Si está, muestra solo esa cantidad de filas por página, con un pie "Página 1 de N". */
  pageSize?: number;
  /** Al cambiar (p. ej. los filtros concatenados), vuelve a la página 1. */
  pageResetKey?: string;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [lastResetKey, setLastResetKey] = useState(pageResetKey);
  if (pageResetKey !== lastResetKey) {
    // Ajuste durante el render (patrón de React para derivar estado de props).
    setLastResetKey(pageResetKey);
    setPage(0);
  }

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.id === sort.columnId);
    if (!column?.sortValue) return rows;
    const getValue = column.sortValue;
    const dir = sort.direction === "asc" ? 1 : -1;
    return rows
      .map((row, index) => ({ row, index, value: getValue(row) }))
      .sort((a, b) => {
        // null al final en ambas direcciones
        if (a.value === null && b.value !== null) return 1;
        if (b.value === null && a.value !== null) return -1;
        const cmp = compareValues(a.value, b.value) * dir;
        return cmp !== 0 ? cmp : a.index - b.index;
      })
      .map((x) => x.row);
  }, [rows, columns, sort]);

  const pageCount = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const currentPage = Math.min(page, pageCount - 1);
  const visible = pageSize ? sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize) : sorted;

  function toggleSort(columnId: string) {
    setSort((prev) => {
      if (!prev || prev.columnId !== columnId) return { columnId, direction: "asc" };
      return { columnId, direction: prev.direction === "asc" ? "desc" : "asc" };
    });
  }

  function onRowClick(e: MouseEvent<HTMLTableRowElement>, row: T) {
    if (!rowHref) return;
    const target = e.target as HTMLElement;
    if (target.closest(INTERACTIVE)) return;
    router.push(rowHref(row));
  }

  if (rows.length === 0) {
    return <>{empty ?? <EmptyState title="No hay datos para mostrar" />}</>;
  }

  const table = (
    <Table containerClassName={maxHeightClassName}>
      {caption ? <caption className="sr-only">{caption}</caption> : null}
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map((col) => {
            const sortable = Boolean(col.sortValue);
            const active = sort?.columnId === col.id;
            const ariaSort = active ? (sort.direction === "asc" ? "ascending" : "descending") : "none";
            const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
            return (
              <TableHead
                key={col.id}
                numeric={col.numeric}
                className={col.className}
                aria-sort={sortable ? ariaSort : undefined}
              >
                {sortable ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(col.id)}
                    className={cn(
                      "-mx-1 inline-flex h-7 items-center gap-1 rounded-sm px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active && "text-foreground",
                      col.numeric && "flex-row-reverse",
                    )}
                  >
                    {col.header}
                    <Icon className={cn("h-3.5 w-3.5", !active && "opacity-60")} aria-hidden />
                  </button>
                ) : (
                  col.header
                )}
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {visible.map((row) => {
          const id = getRowId(row);
          const href = rowHref?.(row);
          return (
            <TableRow
              key={id}
              onClick={(e) => onRowClick(e, row)}
              className={cn(href && "cursor-pointer")}
            >
              {columns.map((col, i) => (
                <TableCell key={col.id} numeric={col.numeric} className={col.className}>
                  {i === 0 && href ? (
                    <Link
                      href={href}
                      className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {col.cell(row)}
                    </Link>
                  ) : (
                    col.cell(row)
                  )}
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  if (!pageSize || pageCount <= 1) return table;
  return (
    <>
      {table}
      <nav
        aria-label="Paginación"
        className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm"
      >
        <span className="tabular-nums text-muted-foreground" aria-live="polite">
          Página {currentPage + 1} de {pageCount}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage === 0}
          >
            Anterior
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage >= pageCount - 1}
          >
            Siguiente
          </Button>
        </div>
      </nav>
    </>
  );
}
