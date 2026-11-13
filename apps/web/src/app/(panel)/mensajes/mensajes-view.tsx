"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, m, useReducedMotionConfig } from "motion/react";
import { Check, CheckCheck, ExternalLink, Inbox, MessageCircle, Moon, RotateCw } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { SegmentedControl } from "@/components/segmented-control";
import { Badge, Button, ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { useDeferredDelete, usePendingDeletions } from "@/lib/deferred-delete";
import { fades, springs } from "@/lib/motion";
import { markInquiryAnsweredAction } from "./actions";

type Status = "PENDING" | "ANSWERED";

/** Fila serializable (sin Date ni funciones). */
export type InquiryRow = {
  id: string;
  status: Status;
  patientId: string;
  /** null → "Sin nombre". */
  name: string | null;
  /** Teléfono con formato, o HIDDEN_NUMBER_TEXT. */
  phoneLabel: string;
  /** null para los contactos que no muestran el número (@lid). */
  waUrl: string | null;
  /** "Hoy, 22:40" · "Ayer, 9:15" · "Hace 2 días". */
  receivedLabel: string;
  receivedISO: string;
  receivedSort: number;
  /** "Respondida hace 2 días". */
  answeredLabel: string | null;
  answeredSort: number;
  afterHours: boolean;
  body: string;
};

export const MENSAJES_TEXT = {
  title: "Mensajes",
  description: "Lo que te dejaron con “Hablar con la nutricionista”. Respondé desde WhatsApp.",
  live: "Se actualiza sola",
  refresh: "Actualizar ahora",
  pending: (n: number) => `Pendientes (${n})`,
  answered: "Respondidas",
  noName: "Sin nombre",
  afterHours: "Fuera de horario",
  reply: "Responder por WhatsApp",
  open: "Abrir WhatsApp",
  hiddenNumber: "Respondé desde tu WhatsApp: este contacto no muestra el número",
  markAnswered: "Ya respondí",
  marked: "Marcada como respondida",
  undone: "Listo, sigue pendiente",
  error: "No se pudo marcar la consulta. Probá de nuevo.",
  justAnswered: "Respondida recién",
  emptyPending: "No tenés mensajes pendientes.",
  emptyPendingDescription: "Acá aparecen las consultas que te dejan con «Hablar con la nutricionista».",
  emptyAnswered: "Todavía no marcaste ninguna consulta como respondida.",
} as const;

const T = MENSAJES_TEXT;

export function inquiryAnsweredKey(id: string): string {
  return `inquiry-answered:${id}`;
}

type Tab = "PENDING" | "ANSWERED";

/** HU-011 / HU-017b-3: bandeja "Mensajes" como tarjetas, con "Ya respondí" diferido (D16). */
export function MensajesView({ rows }: { rows: InquiryRow[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("PENDING");
  const pendingKeys = usePendingDeletions();
  const deferred = useDeferredDelete();

  // Durante los 8 s del "Deshacer" la consulta ya se ve en "Respondidas" (en la base sigue PENDING).
  const { pending, answered } = useMemo(() => {
    const p: InquiryRow[] = [];
    const a: InquiryRow[] = [];
    for (const r of rows) {
      if (r.status === "PENDING" && !pendingKeys.has(inquiryAnsweredKey(r.id))) p.push(r);
      else if (r.status === "PENDING") a.push({ ...r, status: "ANSWERED", answeredLabel: T.justAnswered, answeredSort: Number.MAX_SAFE_INTEGER });
      else a.push(r);
    }
    p.sort((x, y) => x.receivedSort - y.receivedSort); // de la más vieja a la más nueva
    a.sort((x, y) => y.answeredSort - x.answeredSort || y.receivedSort - x.receivedSort);
    return { pending: p, answered: a };
  }, [rows, pendingKeys]);

  const visible = tab === "PENDING" ? pending : answered;

  function markAnswered(row: InquiryRow) {
    deferred({
      key: inquiryAnsweredKey(row.id),
      message: T.marked,
      undoneMessage: T.undone,
      errorMessage: T.error,
      commit: () => markInquiryAnsweredAction(row.id),
    });
  }

  return (
    <div>
      <PageHeader
        title={T.title}
        description={T.description}
        action={
          <div className="flex items-center gap-2 text-subheadline text-muted-foreground">
            <span className="hidden sm:inline">{T.live}</span>
            <span aria-hidden className="hidden sm:inline">
              ·
            </span>
            <Button variant="plain" size="lg" className="px-2" onClick={() => router.refresh()}>
              <RotateCw aria-hidden />
              {T.refresh}
            </Button>
          </div>
        }
      />
      {/* Una consulta nueva aparece sola, sin recargar. */}
      <AutoRefresh seconds={30} />

      <SegmentedControl<Tab>
        value={tab}
        onValueChange={setTab}
        aria-label="Qué consultas ver"
        size="lg"
        className="mb-5 grid w-full sm:inline-grid sm:w-auto"
        options={[
          { value: "PENDING", label: T.pending(pending.length) },
          { value: "ANSWERED", label: T.answered },
        ]}
      />

      {visible.length === 0 ? (
        <div className="rounded-xl bg-card shadow-card">
          {tab === "PENDING" ? (
            <EmptyState icon={Inbox} title={T.emptyPending} description={T.emptyPendingDescription} />
          ) : (
            <EmptyState icon={CheckCheck} title={T.emptyAnswered} />
          )}
        </div>
      ) : (
        <InquiryList rows={visible} onMarkAnswered={markAnswered} />
      )}
    </div>
  );
}

function InquiryList({ rows, onMarkAnswered }: { rows: InquiryRow[]; onMarkAnswered: (row: InquiryRow) => void }) {
  const reduced = Boolean(useReducedMotionConfig());
  return (
    <ul className="space-y-3" aria-label="Consultas">
      <AnimatePresence initial={false} mode="popLayout">
        {rows.map((r) => (
          <m.li
            key={r.id}
            layout={reduced ? false : "position"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, x: 0 }}
            // Sale hacia la derecha, donde está "Respondidas"; con movimiento reducido, solo un fundido.
            exit={reduced ? { opacity: 0, transition: fades.fast } : { opacity: 0, x: 48, transition: springs.quick }}
            transition={reduced ? fades.fast : springs.standard}
          >
            <InquiryCard row={r} onMarkAnswered={onMarkAnswered} />
          </m.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

function InquiryCard({ row, onMarkAnswered }: { row: InquiryRow; onMarkAnswered: (row: InquiryRow) => void }) {
  const who = row.name ?? T.noName;
  const isPending = row.status === "PENDING";
  return (
    <article
      aria-label={`Consulta de ${who}`}
      className="rounded-xl bg-card p-4 shadow-card more-contrast:border more-contrast:border-input sm:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-headline">
            <Link
              href={`/pacientes/${row.patientId}`}
              className="rounded-sm underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {who}
            </Link>
          </h2>
          <p className="text-subheadline tabular-nums text-muted-foreground">{row.phoneLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-subheadline text-muted-foreground">
          <time dateTime={row.receivedISO} className="tabular-nums">
            {row.receivedLabel}
          </time>
          {row.afterHours ? (
            <Badge tone="info">
              <Moon className="mr-1 size-3" aria-hidden />
              {T.afterHours}
            </Badge>
          ) : null}
        </div>
      </header>

      <p className="mt-3 whitespace-pre-wrap break-words text-body">{row.body}</p>

      {isPending ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {row.waUrl ? (
            <ButtonLink
              variant="tinted"
              size="lg"
              href={row.waUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${T.reply} a ${who} (se abre en otra pestaña)`}
            >
              <MessageCircle aria-hidden />
              {T.reply}
              <ExternalLink className="size-4 opacity-70" aria-hidden />
            </ButtonLink>
          ) : (
            <p className="text-callout text-muted-foreground sm:mr-2">{T.hiddenNumber}</p>
          )}
          <Button
            variant="secondary"
            size="lg"
            onClick={() => onMarkAnswered(row)}
            aria-label={`${T.markAnswered}: consulta de ${who}`}
          >
            <Check aria-hidden />
            {T.markAnswered}
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-subheadline text-muted-foreground">{row.answeredLabel}</p>
          {row.waUrl ? (
            <ButtonLink
              variant="plain"
              size="lg"
              className="px-2"
              href={row.waUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${T.open} con ${who} (se abre en otra pestaña)`}
            >
              <MessageCircle aria-hidden />
              {T.open}
            </ButtonLink>
          ) : null}
        </div>
      )}
    </article>
  );
}
