"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Clock, Inbox, Pause, Play, RotateCw } from "lucide-react";
import { OUTBOX_STATUS_TEXT, OUTBOX_TEXT } from "@nutri-bot/core";
import { AutoRefresh } from "@/components/auto-refresh";
import { useConfirm } from "@/components/confirm";
import { GroupedList } from "@/components/grouped-list";
import { SegmentedControl } from "@/components/segmented-control";
import { Button, EmptyState, Select, cn } from "@/components/ui";
import { DetailDisclosure } from "../pacientes/[id]/detail-disclosure";
import { retryAllFailedAction, retryMessageAction } from "./actions";

const T = OUTBOX_TEXT;

type Status = "PENDING" | "SENT" | "FAILED";

/** Fila serializable: todo en palabras (tipo, destinatario y fecha ya resueltos en el servidor). */
export interface MessageRow {
  id: string;
  status: Status;
  /** "Recordatorio de turno" (MESSAGE_KIND_TEXT). */
  kindLabel: string;
  /** "Vos", nombre, teléfono con formato o HIDDEN_NUMBER_TEXT. */
  to: string;
  body: string;
  error: string | null;
  /** "hoy, 10:02". */
  at: string;
  atISO: string;
}

const statusMeta = {
  PENDING: { icon: Clock, className: "text-warning" },
  SENT: { icon: CircleCheck, className: "text-success" },
  FAILED: { icon: CircleAlert, className: "text-destructive" },
} as const;

type Filter = "ALL" | Status;

const READ_ONLY_TITLE = "Página de prueba: solo lectura";

/**
 * "Mensajes que mandó el bot" (HU-017b-3): lista con destinatario, tipo y estado en palabras; el
 * error técnico queda detrás de "Ver detalle" (D15). `readOnly` es para la página de prueba: sin
 * AutoRefresh y con "Reintentar" deshabilitado.
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
  const confirm = useConfirm();

  const filterOptions: { value: Filter; label: string }[] = [
    { value: "ALL", label: T.filterAll },
    { value: "PENDING", label: T.filterPending },
    { value: "SENT", label: T.filterSent },
    { value: "FAILED", label: counts.FAILED > 0 ? `${T.filterFailed} (${counts.FAILED})` : T.filterFailed },
  ];

  const visible = useMemo(() => (filter === "ALL" ? rows : rows.filter((r) => r.status === filter)), [rows, filter]);

  return (
    <section aria-labelledby="cola-titulo">
      {readOnly ? null : <AutoRefresh seconds={intervalSeconds} enabled={live} />}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="cola-titulo" className="text-title-3">
          {T.queueTitle}
        </h2>
        <div className="flex flex-wrap items-center gap-1">
          <p role="status" aria-atomic="true" className="mr-1 flex items-center gap-2 text-subheadline text-muted-foreground">
            <span
              aria-hidden
              className={cn("size-2 rounded-full", live ? "bg-success motion-safe:animate-pulse" : "bg-muted-foreground")}
            />
            {live ? T.live : T.paused}
            <span aria-hidden>·</span>
            <span className="tabular-nums">{T.pendingCount(counts.PENDING)}</span>
          </p>
          {readOnly ? null : (
            <Button variant="plain" size="lg" className="px-2" onClick={() => router.refresh()}>
              <RotateCw aria-hidden />
              {T.refresh}
            </Button>
          )}
          <Button variant="plain" size="lg" className="px-2" onClick={() => setLive((v) => !v)} aria-pressed={!live}>
            {live ? <Pause aria-hidden /> : <Play aria-hidden />}
            {live ? T.pause : T.resume}
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Cuatro opciones no entran legibles en un segmentado de 390 px: en el celular, una lista nativa. */}
        <div className="w-full sm:hidden">
          <label htmlFor="cola-filtro" className="sr-only">
            Qué mensajes ver
          </label>
          <Select id="cola-filtro" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="h-11">
            {filterOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <SegmentedControl<Filter>
          value={filter}
          onValueChange={setFilter}
          aria-label="Qué mensajes ver"
          size="lg"
          className="hidden sm:inline-grid"
          options={filterOptions}
        />
        {counts.FAILED > 0 ? (
          <Button
            variant="secondary"
            size="lg"
            className="sm:ml-auto"
            loading={retryingAll}
            disabled={readOnly}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            onClick={async () => {
              // Confirmación fuera de la transición (ver JSDoc de useConfirm).
              const ok = await confirm({
                title: T.retryAllTitle(counts.FAILED),
                description: T.retryDescription,
                confirmLabel: T.retryAll(counts.FAILED),
                cancelLabel: "Volver",
                destructive: false,
              });
              if (ok) startRetryAll(() => retryAllFailedAction());
            }}
          >
            {retryingAll ? null : <RotateCw aria-hidden />}
            {retryingAll ? T.retrying : T.retryAll(counts.FAILED)}
          </Button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl bg-card shadow-card">
          {rows.length === 0 ? (
            <EmptyState icon={Inbox} title={T.emptyQueue} description={T.emptyQueueDescription} />
          ) : (
            <EmptyState title={T.emptyFilter} />
          )}
        </div>
      ) : (
        <GroupedList>
          {visible.map((m) => (
            <MessageItem key={m.id} message={m} readOnly={readOnly} />
          ))}
        </GroupedList>
      )}
    </section>
  );
}

function MessageItem({ message: m, readOnly }: { message: MessageRow; readOnly: boolean }) {
  const meta = statusMeta[m.status];
  const Icon = meta.icon;
  return (
    <li className="relative px-4 py-3 after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-border last:after:hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <p className="min-w-0 text-callout">
          <span className={cn("inline-flex items-center gap-1 font-semibold", meta.className)}>
            <Icon className="size-4 shrink-0 self-center" strokeWidth={2} aria-hidden />
            {OUTBOX_STATUS_TEXT[m.status]}
          </span>
          <span className="text-muted-foreground"> · </span>
          <span className="font-medium">{m.kindLabel}</span>
          <span className="text-muted-foreground"> · </span>
          <span className="break-words">{m.to}</span>
        </p>
        <time dateTime={m.atISO} className="shrink-0 text-subheadline tabular-nums text-muted-foreground">
          {m.at}
        </time>
      </div>
      <p className="mt-1 line-clamp-2 break-words text-subheadline text-muted-foreground">{m.body}</p>
      {m.status === "FAILED" ? (
        <div className="mt-1 flex flex-wrap items-start justify-between gap-x-4">
          <div className="min-w-0">
            <p className="pt-2.5 text-callout text-destructive">{T.notSent}</p>
            {m.error ? (
              <DetailDisclosure label={T.seeDetail}>
                <p className="mb-1 break-all rounded-md bg-secondary px-3 py-2 font-mono text-footnote text-muted-foreground">
                  {m.error}
                </p>
              </DetailDisclosure>
            ) : null}
          </div>
          <RetryButton id={m.id} to={m.to} readOnly={readOnly} />
        </div>
      ) : null}
    </li>
  );
}

function RetryButton({ id, to, readOnly }: { id: string; to: string; readOnly: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="tinted"
      size="lg"
      className="mt-1"
      loading={pending}
      disabled={readOnly}
      title={readOnly ? READ_ONLY_TITLE : undefined}
      aria-label={`${T.retry}: mensaje a ${to}`}
      onClick={() => start(() => retryMessageAction(id))}
    >
      {pending ? null : <RotateCw aria-hidden />}
      {pending ? T.retrying : T.retry}
    </Button>
  );
}
