"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, cn } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
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

const statusMeta: Record<Status, { tone: "amber" | "green" | "red"; label: string }> = {
  PENDING: { tone: "amber", label: "Pendiente" },
  SENT: { tone: "green", label: "Enviado" },
  FAILED: { tone: "red", label: "Falló" },
};

type Filter = "ALL" | Status;

export function AvisosView({
  rows,
  counts,
  intervalSeconds,
}: {
  rows: MessageRow[];
  counts: Record<Status, number>;
  intervalSeconds: number;
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

  return (
    <div>
      <AutoRefresh seconds={intervalSeconds} enabled={live} />

      {/* Estado en vivo + controles */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p
          role="status"
          aria-atomic="true"
          className="flex items-center gap-2 text-sm text-ink-soft"
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              live ? "bg-leaf motion-safe:animate-pulse" : "bg-ink-faint",
            )}
          />
          {live ? "En vivo" : "Pausado"}
          <span className="text-ink-faint">·</span>
          {counts.PENDING} pendiente{counts.PENDING === 1 ? "" : "s"}
          {counts.FAILED > 0 ? (
            <>
              <span className="text-ink-faint">·</span>
              <span className="font-medium text-red-600">{counts.FAILED} con error</span>
            </>
          ) : null}
        </p>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.refresh()}>
            Actualizar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setLive((v) => !v)}>
            {live ? "Pausar" : "Reanudar"}
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {chips.map((c) => {
          const active = filter === c.key;
          const danger = c.key === "FAILED" && c.count > 0;
          return (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              aria-pressed={active}
              className={cn(
                "press border-2 px-3 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "border-ink bg-ink text-white"
                  : danger
                    ? "border-red-300 text-red-700 hover:border-red-500"
                    : "border-line text-ink-soft hover:border-ink",
              )}
            >
              {c.label} ({c.count})
            </button>
          );
        })}

        {counts.FAILED > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={retryingAll}
            onClick={() => startRetryAll(() => retryAllFailedAction())}
            className="ml-auto"
          >
            {retryingAll ? "Reintentando…" : `Reintentar ${counts.FAILED} fallido${counts.FAILED === 1 ? "" : "s"}`}
          </Button>
        ) : null}
      </div>

      {/* Lista */}
      {rows.length === 0 ? (
        <EmptyBox>
          Todavía no hay mensajes. El bot los va a listar acá cuando envíe confirmaciones o
          recordatorios.
        </EmptyBox>
      ) : visible.length === 0 ? (
        <EmptyBox>No hay mensajes en este filtro.</EmptyBox>
      ) : (
        <ul className="reveal divide-y divide-line border border-line bg-paper px-4 shadow-card">
          {visible.map((m) => (
            <Row key={m.id} m={m} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ m }: { m: MessageRow }) {
  const meta = statusMeta[m.status];
  return (
    <li className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <span className="text-sm font-medium text-ink">{m.kind}</span>
          <span className="text-xs text-ink-soft">→ {m.to}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{m.body}</p>
        {m.error ? <p className="mt-1 text-xs text-red-600">Error: {m.error}</p> : null}
      </div>
      <div className="flex items-center gap-3 whitespace-nowrap sm:flex-col sm:items-end sm:gap-1">
        <span className="text-xs text-ink-soft">{m.at}</span>
        {m.status === "FAILED" ? <RetryButton id={m.id} /> : null}
      </div>
    </li>
  );
}

function RetryButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => retryMessageAction(id))}
      disabled={pending}
      className="press text-xs font-semibold text-leaf-deep transition-colors hover:text-ink disabled:opacity-50"
    >
      {pending ? "Reintentando…" : "Reintentar"}
    </button>
  );
}

function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-dashed border-line bg-paper px-6 py-12 text-center text-sm leading-relaxed text-ink-soft">
      {children}
    </div>
  );
}
