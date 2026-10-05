"use client";

import { useMemo, useState } from "react";
import { CircleCheck, Clock, Search, SearchX, Wallet } from "lucide-react";
import { PAYMENT_TEXT } from "@nutri-bot/core";
import { GroupedList, GroupedListRow } from "@/components/grouped-list";
import { SegmentedControl } from "@/components/segmented-control";
import { Button, EmptyState, Input } from "@/components/ui";

export interface PaymentRow {
  id: string;
  status: "PENDING" | "APPROVED";
  patient: string;
  service: string;
  /** "jueves 9 de octubre, 10:00". */
  appointmentLabel: string;
  dateISO: string;
  kind: "DEPOSIT" | "FULL";
  provider: "manual" | "mercadopago";
  amountLabel: string;
}

type StatusFilter = "ALL" | "PENDING" | "APPROVED";

/** Sin tildes ni mayúsculas, para que "Pérez" y "perez" coincidan. */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** HU-017b-3 (D11): lista agrupada en todos los anchos, buscador + segmentado, glosario simple. */
export function PaymentsTable({ rows, monthLabel }: { rows: PaymentRow[]; monthLabel: string }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    return rows
      .filter((r) => {
        if (status !== "ALL" && r.status !== status) return false;
        if (q && !fold(r.patient).includes(q) && !fold(r.service).includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  }, [rows, query, status]);

  const hasFilter = query.trim() !== "" || status !== "ALL";
  function clear() {
    setQuery("");
    setStatus("ALL");
  }

  return (
    <section aria-label="Lista de pagos">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <label htmlFor="pagos-buscar" className="sr-only">
            Buscar por paciente o servicio
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="pagos-buscar"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Paciente o servicio…"
            spellCheck={false}
            className="h-11 pl-9"
            autoComplete="off"
          />
        </div>
        <SegmentedControl<StatusFilter>
          value={status}
          onValueChange={setStatus}
          aria-label="Qué pagos ver"
          size="lg"
          className="grid w-full sm:inline-grid sm:w-auto"
          options={[
            { value: "ALL", label: "Todos" },
            { value: "PENDING", label: PAYMENT_TEXT.status.PENDING },
            { value: "APPROVED", label: "Cobrados" },
          ]}
        />
        <p className="text-subheadline tabular-nums text-muted-foreground sm:ml-auto" aria-live="polite">
          {filtered.length === 1 ? "1 pago" : `${filtered.length} pagos`}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl bg-card shadow-card">
          {rows.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title={`No hay pagos en ${monthLabel}`}
              description="Acá aparecen las señas de Mercado Pago y los pagos que registres a mano."
            />
          ) : (
            <EmptyState
              icon={SearchX}
              title="Ningún pago coincide con la búsqueda"
              action={
                hasFilter ? (
                  <Button variant="tinted" size="lg" onClick={clear}>
                    Ver todos
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
      ) : (
        <GroupedList>
          {filtered.map((r) => {
            const approved = r.status === "APPROVED";
            const StatusIcon = approved ? CircleCheck : Clock;
            return (
              <GroupedListRow
                key={r.id}
                size="lg"
                label={
                  <span className="block truncate">
                    {r.patient} <span className="font-normal text-muted-foreground">· {r.service}</span>
                  </span>
                }
                description={
                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span>Turno: {r.appointmentLabel}</span>
                    <span aria-hidden>·</span>
                    <span className={approved ? "inline-flex items-center gap-1 text-success" : "inline-flex items-center gap-1 text-warning"}>
                      <StatusIcon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
                      {PAYMENT_TEXT.status[r.status]}
                    </span>
                    <span aria-hidden>·</span>
                    <span>
                      {PAYMENT_TEXT.kind[r.kind]} · {PAYMENT_TEXT.provider(r.provider)}
                    </span>
                  </span>
                }
                accessory={<span className="text-headline tabular-nums sm:text-title-3">{r.amountLabel}</span>}
              />
            );
          })}
        </GroupedList>
      )}
    </section>
  );
}
