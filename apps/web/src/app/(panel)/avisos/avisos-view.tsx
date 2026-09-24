"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Inbox, RotateCw } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ToggleGroup, ToggleGroupItem } from "@/components/primitives/toggle-group";
import { Badge, Button, Card, EmptyState, cn } from "@/components/ui";
import { retryAllFailedAction, retryMessageAction } from "./actions";

type Status = "PENDING" | "SENT" | "FAILED";

export interface MessageRow {
  id: string;
  status: Status;
  kind: string;
  to: string;
  body: string;
  error: string | null;
  at: string;
}

const statusMeta: Record<Status, { tone: "warning" | "success" | "danger"; label: string }> = {
  PENDING: { tone: "warning", label: "Pendiente" },
  SENT: { tone: "success", label: "Enviado" },
  FAILED: { tone: "danger", label: "Falló" },
};

type Filter = "ALL" | Status;

const READ_ONLY_TITLE = "Página de prueba: solo lectura";

/**
 * Cola de mensajes salientes. `readOnly` es solo para la página de prueba: sin AutoRefresh y con
 * "Reintentar" deshabilitado (se ve, no llama a nada).
 */
export function AvisosView({
  rows,
  counts,
  intervalSeconds,
  readOnly = false,
}: {
  rows: MessageRow[];
  counts: Record<Status, number>;
  intervalSeconds: number;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [live, setLive] = useState(true);
  const [retryingAll, startRetryAll] = useTransition();

  const visible = useMemo(
    () => (filter === "ALL" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "ALL", label: "Todos", count: counts.PENDING + counts.SENT + counts.FAILED },
    { key: "PENDING", label: "Pendientes", count: counts.PENDING },
    { key: "SENT", label: "Enviados", count: counts.SENT },
    { key: "FAILED", label: "Fallidos", count: counts.FAILED },
  ];

  // LÍMITE RSC: `cell` es una función, así que las columnas viven acá y no en page.tsx.
  const columns = useMemo<DataTableColumn<MessageRow>[]>(
    () => [
      {
        id: "estado",
        header: "Estado",
        cell: (m) => <Badge tone={statusMeta[m.status].tone}>{statusMeta[m.status].label}</Badge>,
      },
      {
        id: "tipo",
        header: "Tipo",
        cell: (m) => <span className="whitespace-nowrap font-medium">{m.kind}</span>,
      },
      {
        id: "destinatario",
        header: "Destinatario",
        cell: (m) => <span className="whitespace-nowrap tabular-nums text-muted-foreground">{m.to}</span>,
      },
      {
        id: "mensaje",
        header: "Mensaje",
        className: "min-w-64",
        cell: (m) => (
          <>
            <p className="line-clamp-2 text-muted-foreground">{m.body}</p>
            {m.error ? <p className="mt-1 text-xs text-destructive">Error: {m.error}</p> : null}
          </>
        ),
      },
      {
        id: "fecha",
        header: "Fecha",
        cell: (m) => <span className="whitespace-nowrap tabular-nums text-muted-foreground">{m.at}</span>,
      },
      {
        id: "accion",
        header: "",
        cell: (m) => (m.status === "FAILED" ? <RetryButton id={m.id} to={m.to} readOnly={readOnly} /> : null),
      },
    ],
    [readOnly],
  );

  return (
    <Card
      padding="none"
      title="Cola de mensajes"
      actions={
        <>
          <p role="status" aria-atomic="true" className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              aria-hidden
              className={cn(
                "h-2 w-2 rounded-full",
                live ? "bg-success motion-safe:animate-pulse" : "bg-muted-foreground",
              )}
            />
            {live ? "En vivo" : "Pausado"}
            <span aria-hidden>·</span>
            <span className="tabular-nums">
              {counts.PENDING} pendiente{counts.PENDING === 1 ? "" : "s"}
            </span>
            {counts.FAILED > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span className="font-medium tabular-nums text-destructive">{counts.FAILED} con error</span>
              </>
            ) : null}
          </p>
          {readOnly ? null : (
            <Button variant="ghost" size="sm" onClick={() => router.refresh()}>
              <RotateCw aria-hidden />
              Actualizar
            </Button>
          )}
          {/* En readOnly no hay AutoRefresh, pero el estado "En vivo"/"Pausado" se sigue pudiendo
              alternar (recorrido §13.5.9: "sin refrescar la página"). */}
          <Button variant="ghost" size="sm" onClick={() => setLive((v) => !v)}>
            {live ? "Pausar" : "Reanudar"}
          </Button>
        </>
      }
    >
      {readOnly ? null : <AutoRefresh seconds={intervalSeconds} enabled={live} />}

      <div className="flex flex-wrap items-center gap-3 border-b px-6 py-3">
        <ToggleGroup
          type="single"
          variant="outline"
          value={filter}
          onValueChange={(v) => v && setFilter(v as Filter)}
          aria-label="Filtrar por estado"
          className="rounded-md border border-input p-0.5 [&>button]:border-0"
        >
          {chips.map((c) => (
            <ToggleGroupItem
              key={c.key}
              value={c.key}
              className={cn(
                "data-[state=on]:font-semibold",
                c.key === "FAILED" && c.count > 0 && "text-destructive data-[state=on]:text-destructive",
              )}
            >
              {c.label} ({c.count})
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {counts.FAILED > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            loading={retryingAll}
            disabled={readOnly}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            onClick={() => startRetryAll(() => retryAllFailedAction())}
          >
            {retryingAll ? null : <RotateCw aria-hidden />}
            {retryingAll
              ? "Reintentando…"
              : `Reintentar ${counts.FAILED} fallido${counts.FAILED === 1 ? "" : "s"}`}
          </Button>
        ) : null}
      </div>

      <DataTable<MessageRow>
        columns={columns}
        rows={visible}
        getRowId={(m) => m.id}
        caption="Mensajes salientes"
        maxHeightClassName="max-h-[60vh]"
        empty={
          rows.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Todavía no hay mensajes"
              description="El bot los va a listar acá cuando envíe confirmaciones o recordatorios."
            />
          ) : (
            <EmptyState title="No hay mensajes en este filtro." />
          )
        }
      />
    </Card>
  );
}

function RetryButton({ id, to, readOnly }: { id: string; to: string; readOnly: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      disabled={readOnly}
      title={readOnly ? READ_ONLY_TITLE : undefined}
      aria-label={`Reintentar el mensaje a ${to}`}
      onClick={() => start(() => retryMessageAction(id))}
    >
      {pending ? "Reintentando…" : "Reintentar"}
    </Button>
  );
}
