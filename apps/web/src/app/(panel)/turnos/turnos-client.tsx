"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarX, ChevronLeft, ChevronRight, Plus, Search, SearchX } from "lucide-react";
import {
  APPOINTMENT_LIST_TEXT,
  DEFAULT_APPOINTMENT_LIST_FILTERS,
  buildAppointmentListRows,
  countAppointmentCards,
  matchesAppointmentFilters,
  monthName,
  monthTitle,
  shiftMonthKey,
  type AppointmentListFilters,
  type AppointmentListInput,
} from "@nutri-bot/core";
import { Button, EmptyState, Input, Metric, PageHeader } from "@/components/ui";
import { useMediaQuery } from "@/lib/use-media-query";
import { NewAppointmentModal, type ServiceOption } from "../new-appointment-modal";
import type { TurnosAppointment } from "./data";
import { AppointmentsMobileList } from "./appointments-mobile-list";
import { AppointmentsTable } from "./appointments-table";

const T = APPOINTMENT_LIST_TEXT;

const navButton =
  "inline-flex size-11 items-center justify-center rounded-full text-primary press-none transition-colors duration-hover hover:bg-overlay-hover pressed:bg-overlay-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const cardClass = "rounded-xl bg-card px-5 py-4 shadow-card more-contrast:border more-contrast:border-input";

function toInput(a: TurnosAppointment): AppointmentListInput {
  return {
    id: a.id,
    startsAt: new Date(a.startsAt),
    status: a.status,
    cancelReason: a.cancelReason,
    price: a.price,
    approvedAmounts: a.approvedAmounts,
    reason: a.reason,
    serviceId: a.service.id,
    serviceName: a.service.name,
    patient: a.patient,
  };
}

function monthHref(key: string, currentMonth: string): string {
  return key === currentMonth ? "/turnos" : `/turnos?mes=${key}`;
}

/** HU-021 (SDD 7.1). Pantalla "Turnos": tarjetas, buscador y lista del mes. Toda la derivación es de core. */
export function TurnosClient({
  appointments,
  month,
  currentMonth,
  nowISO,
  tz,
  currency,
  todayKey,
  services,
}: {
  appointments: TurnosAppointment[];
  /** "yyyy-MM" que se muestra. */
  month: string;
  /** "yyyy-MM" en curso (se escribe sin ?mes). */
  currentMonth: string;
  /** T9: el instante lo fija el servidor. */
  nowISO: string;
  tz: string;
  currency: string;
  todayKey: string;
  /** Servicios activos, para "Nuevo turno". */
  services: ServiceOption[];
  /** Todos los servicios, para el filtro de servicio. */
  filterServices: { id: string; name: string }[];
}) {
  const router = useRouter();
  const wide = useMediaQuery("(min-width: 640px)", true);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");

  const rows = useMemo(
    () => buildAppointmentListRows(appointments.map(toInput), new Date(nowISO), tz, currency),
    [appointments, nowISO, tz, currency],
  );
  const filters: AppointmentListFilters = { ...DEFAULT_APPOINTMENT_LIST_FILTERS, query };
  const filtered = rows.filter((r) => matchesAppointmentFilters(r, filters));
  const cards = countAppointmentCards(filtered);
  const filtering = query.trim() !== "";

  const title = monthTitle(month);
  const prevMonth = shiftMonthKey(month, -1);
  const nextMonth = shiftMonthKey(month, 1);

  const newAppointmentButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus aria-hidden />
      {T.newAppointment}
    </Button>
  );

  return (
    <div>
      <PageHeader title={T.title} description={T.description} action={newAppointmentButton} />

      <nav aria-label={T.monthNav.label} className="mb-6 flex items-center gap-1">
        <Link
          href={monthHref(prevMonth, currentMonth)}
          className={navButton}
          aria-label={T.monthNav.prev(monthTitle(prevMonth))}
          title="Mes anterior"
        >
          <ChevronLeft className="size-5" strokeWidth={2} aria-hidden />
        </Link>
        <h2 className="min-w-40 text-center text-title-3 tabular-nums" aria-live="polite">
          {title}
        </h2>
        <Link
          href={monthHref(nextMonth, currentMonth)}
          className={navButton}
          aria-label={T.monthNav.next(monthTitle(nextMonth))}
          title="Mes siguiente"
        >
          <ChevronRight className="size-5" strokeWidth={2} aria-hidden />
        </Link>
      </nav>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={cardClass}>
          <Metric
            label={T.cards.total}
            value={cards.total}
            decimals={0}
            caption={cards.unclosed > 0 ? T.cards.unclosed(cards.unclosed) : undefined}
          />
        </div>
        <div className={cardClass}>
          <Metric label={T.cards.pending} value={cards.pending} decimals={0} />
        </div>
        <div className={cardClass}>
          <Metric label={T.cards.completed} value={cards.completed} decimals={0} />
        </div>
        <div className={cardClass}>
          <Metric label={T.cards.cancelled} value={cards.cancelled} decimals={0} />
        </div>
      </div>

      <section aria-label={T.tableCaption(title)}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-xs">
            <label htmlFor="turnos-buscar" className="sr-only">
              {T.searchLabel}
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="turnos-buscar"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={T.searchPlaceholder}
              spellCheck={false}
              className="h-11 pl-9"
              autoComplete="off"
            />
          </div>
          <p className="shrink-0 text-subheadline tabular-nums text-muted-foreground" aria-live="polite">
            {T.count(filtered.length)}
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl bg-card shadow-card more-contrast:border more-contrast:border-input">
            {filtering ? (
              <EmptyState
                icon={SearchX}
                title={T.noMatches}
                action={
                  <Button variant="tinted" size="lg" onClick={() => setQuery("")}>
                    {T.seeAll}
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={CalendarX} title={T.emptyMonth(monthName(month))} action={newAppointmentButton} />
            )}
          </div>
        ) : wide ? (
          <AppointmentsTable rows={filtered} caption={T.tableCaption(title)} />
        ) : (
          <AppointmentsMobileList rows={filtered} />
        )}
      </section>

      <NewAppointmentModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => router.refresh()}
        services={services}
        tz={tz}
        todayKey={todayKey}
      />
    </div>
  );
}
