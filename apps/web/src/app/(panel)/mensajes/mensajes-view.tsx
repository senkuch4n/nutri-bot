"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Inbox, MessageCircle, Moon, RotateCw } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ToggleGroup, ToggleGroupItem } from "@/components/primitives/toggle-group";
import { Badge, Button, ButtonLink, Card, EmptyState, cn } from "@/components/ui";
import { notify } from "@/lib/notify";
import { markInquiryAnsweredAction } from "./actions";

type Status = "PENDING" | "ANSWERED";

/** Fila serializable (sin Date): las columnas, que tienen funciones, viven en este componente. */
export type InquiryRow = {
  id: string;
  status: Status;
  patientId: string;
  /** name ?? phone */
  patientLabel: string;
  phone: string;
  waUrl: string;
  receivedLabel: string;
  receivedSort: number;
  lastMessageLabel: string | null;
  answeredLabel: string | null;
  afterHours: boolean;
  body: string;
};

type Filter = "PENDING" | "ANSWERED" | "ALL";

const statusMeta: Record<Status, { tone: "warning" | "success"; label: string }> = {
  PENDING: { tone: "warning", label: "Pendiente" },
  ANSWERED: { tone: "success", label: "Respondida" },
};

const EMPTY_PENDING = {
  title: "No hay consultas pendientes.",
  description: "Acá aparecen las consultas que te dejan los pacientes por el bot con la opción “Hablar con la nutricionista”.",
};

/** HU-011: bandeja "Mensajes" (consultas de la opción 0 del bot). */
export function MensajesView({
  rows,
  counts,
}: {
  rows: InquiryRow[];
  counts: { PENDING: number; ANSWERED: number };
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("PENDING");

  const visible = useMemo(
    () => (filter === "ALL" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "PENDING", label: "Pendientes", count: counts.PENDING },
    { key: "ANSWERED", label: "Respondidas", count: counts.ANSWERED },
    { key: "ALL", label: "Todas", count: counts.PENDING + counts.ANSWERED },
  ];

  const columns = useMemo<DataTableColumn<InquiryRow>[]>(
    () => [
      {
        id: "paciente",
        header: "Paciente",
        sortValue: (r) => r.patientLabel,
        cell: (r) => (
          <div className="min-w-0">
            <Link
              href={`/pacientes/${r.patientId}`}
              className="font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              {r.patientLabel}
            </Link>
            <p className="text-xs tabular-nums text-muted-foreground">{r.phone}</p>
          </div>
        ),
      },
      {
        id: "recibida",
        header: "Recibida",
        sortValue: (r) => r.receivedSort,
        cell: (r) => (
          <div className="space-y-1 whitespace-nowrap">
            <p className="tabular-nums">{r.receivedLabel}</p>
            {r.lastMessageLabel ? (
              <p className="text-xs tabular-nums text-muted-foreground">{r.lastMessageLabel}</p>
            ) : null}
            {r.afterHours ? (
              <Badge tone="info">
                <Moon className="mr-1 h-3 w-3" aria-hidden />
                Fuera de horario
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: "consulta",
        header: "Consulta",
        className: "min-w-72",
        cell: (r) => <InquiryBody body={r.body} />,
      },
      {
        id: "estado",
        header: "Estado",
        cell: (r) => (
          <div className="space-y-1 whitespace-nowrap">
            <Badge tone={statusMeta[r.status].tone}>{statusMeta[r.status].label}</Badge>
            {r.answeredLabel ? (
              <p className="text-xs tabular-nums text-muted-foreground">{r.answeredLabel}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: "acciones",
        header: "",
        cell: (r) => (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ButtonLink
              variant="secondary"
              size="sm"
              href={r.waUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Abrir WhatsApp con ${r.patientLabel}`}
            >
              <MessageCircle aria-hidden />
              Abrir WhatsApp
            </ButtonLink>
            {r.status === "PENDING" ? <MarkAnsweredButton id={r.id} patientLabel={r.patientLabel} /> : null}
          </div>
        ),
      },
    ],
    [],
  );

  const empty =
    filter === "ANSWERED" ? (
      <EmptyState icon={Inbox} title="Todavía no marcaste ninguna consulta como respondida." />
    ) : (
      <EmptyState icon={Inbox} title={EMPTY_PENDING.title} description={EMPTY_PENDING.description} />
    );

  return (
    <Card
      padding="none"
      title="Mensajes por WhatsApp"
      actions={
        <Button variant="ghost" size="sm" onClick={() => router.refresh()}>
          <RotateCw aria-hidden />
          Actualizar
        </Button>
      }
    >
      {/* Una consulta nueva aparece sola, sin recargar. */}
      <AutoRefresh seconds={30} />

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
            <ToggleGroupItem key={c.key} value={c.key} className="data-[state=on]:font-semibold">
              {c.label} ({c.count})
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <DataTable<InquiryRow>
        columns={columns}
        rows={visible}
        getRowId={(r) => r.id}
        caption="Consultas de pacientes"
        maxHeightClassName="max-h-[70vh]"
        initialSort={{ columnId: "recibida", direction: "asc" }}
        empty={empty}
      />
    </Card>
  );
}

/** Texto completo en ≥ md; en pantallas chicas, 3 líneas con "Ver más". */
function InquiryBody({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = body.length > 140 || body.split("\n").length > 3;
  return (
    <div>
      <p className={cn("whitespace-pre-wrap break-words", !expanded && "line-clamp-3 md:line-clamp-none")}>
        {body}
      </p>
      {long ? (
        <button
          type="button"
          className="mt-1 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm md:hidden"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Ver menos" : "Ver más"}
        </button>
      ) : null}
    </div>
  );
}

function MarkAnsweredButton({ id, patientLabel }: { id: string; patientLabel: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      aria-label={`Marcar como respondida la consulta de ${patientLabel}`}
      onClick={() =>
        // Sin confirmación (no destruye nada): no hay await confirm() dentro de la transición.
        start(async () => {
          const r = await markInquiryAnsweredAction(id);
          if (r.ok) notify.saved("Consulta marcada como respondida");
          else notify.error(r.error);
        })
      }
    >
      {pending ? null : <Check aria-hidden />}
      {pending ? "Marcando…" : "Marcar como respondida"}
    </Button>
  );
}
