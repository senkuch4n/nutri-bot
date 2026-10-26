"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarX, ChevronLeft, ChevronRight, Plus, Search, SearchX } from "lucide-react";
import {
  AGENDA_TEXT,
  APPOINTMENT_LIST_TEXT,
  DEFAULT_APPOINTMENT_LIST_FILTERS,
  activeAppointmentFilterCount,
  appointmentDayTime,
  appointmentListQuery,
  buildAppointmentListRows,
  countAppointmentCards,
  matchesAppointmentFilters,
  monthName,
  monthTitle,
  parseAppointmentListFilters,
  shiftMonthKey,
  type AppointmentListFilters,
  type AppointmentListInput,
  type AppointmentListRow,
} from "@nutri-bot/core";
import { Button, EmptyState, Input, Metric, PageHeader } from "@/components/ui";
import { usePendingDeletions } from "@/lib/deferred-delete";
import { notify } from "@/lib/notify";
import { replaceUrlInRouter } from "@/lib/patient-tab-route";
import { useMediaQuery } from "@/lib/use-media-query";
import { setStatusAction } from "../actions";
import { appointmentCancelKey, useScheduleAppointmentCancel } from "../appointment-cancel";
import type { SelectedAppointment } from "../appointment-detail-sheet";
import { AppointmentPaymentModal } from "../appointment-payment-modal";
import { NewAppointmentModal, type ServiceOption } from "../new-appointment-modal";
import type { TurnosAppointment } from "./data";
import { AppointmentDetailDialog } from "./appointment-detail-dialog";
import { AppointmentsMobileList } from "./appointments-mobile-list";
import { AppointmentsTable, openButtonId, type AppointmentRowActions } from "./appointments-table";
import { TurnosFilters } from "./turnos-filters";

const T = APPOINTMENT_LIST_TEXT;

const navButton =
  "inline-flex size-11 items-center justify-center rounded-full text-primary press-none transition-colors duration-hover hover:bg-overlay-hover pressed:bg-overlay-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const cardClass = "rounded-xl bg-card px-5 py-4 shadow-card more-contrast:border more-contrast:border-input";

/** T15: mientras la cancelación con "Deshacer" está pendiente, el turno se ve como cancelado. */
function withPendingCancel(a: TurnosAppointment, pending: ReadonlySet<string>): TurnosAppointment {
  return pending.has(appointmentCancelKey(a.id)) ? { ...a, status: "CANCELLED", cancelReason: null } : a;
}

/** SDD 7.6: el turno del detalle, con los datos del DTO y lo derivado de la fila (T6, D9). */
function toSelectedAppointment(dto: TurnosAppointment, row: AppointmentListRow): SelectedAppointment {
  return {
    id: dto.id,
    start: dto.startsAt,
    end: dto.endsAt,
    status: dto.status,
    patientName: dto.patient.name,
    patientPhone: dto.patient.phone,
    serviceName: dto.service.name,
    price: dto.priceSnapshot,
    googleSynced: dto.googleSynced,
    patientId: dto.patient.id,
    consultation: dto.consultation,
    reason: dto.reason,
    patientJid: dto.patient.whatsappJid,
    patientLabel: row.patientLabel,
    hasFullPayment: row.payment.state === "paid" || row.payment.state === "free",
    cancelledBy: dto.cancelledBy,
    cancelReason: dto.cancelReason,
    paymentText: row.paymentText,
    balance: String(row.payment.balance),
    depositAmount: dto.depositAmount ?? undefined,
  };
}

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

/** T10/T11: "/turnos" + query de mes y filtros (el mes en curso se escribe sin ?mes). */
function turnosHref(month: string, currentMonth: string, filters: AppointmentListFilters): string {
  const q = appointmentListQuery(month === currentMonth ? null : month, filters);
  return q ? `/turnos?${q}` : "/turnos";
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
  filterServices,
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
  const searchParams = useSearchParams();
  const wide = useMediaQuery("(min-width: 640px)", true);
  const [creating, setCreating] = useState(false);

  // T10: estado, pago y servicio salen de la URL (fuente de verdad). El buscador usa estado local (para
  // no mover el cursor) y escribe la URL en cada cambio.
  const urlFilters = parseAppointmentListFilters({
    estado: searchParams.get("estado"),
    pago: searchParams.get("pago"),
    servicio: searchParams.get("servicio"),
    q: searchParams.get("q"),
  });
  const [query, setQuery] = useState(urlFilters.query);
  const queryRef = useRef(query);
  queryRef.current = query;
  // Si la URL cambia desde afuera (p. ej. tocar "Turnos" en la sidebar), el buscador se resincroniza.
  useEffect(() => {
    if (urlFilters.query.trim() !== queryRef.current.trim()) setQuery(urlFilters.query);
  }, [urlFilters.query]);
  const [busy, setBusy] = useState<AppointmentRowActions["busy"]>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [origin, setOrigin] = useState<HTMLElement | null>(null);
  // T16: cambios del detalle mostrados al instante; se descartan cuando llegan DTOs nuevos (refresh).
  const [override, setOverride] = useState<{ source: TurnosAppointment[]; appt: SelectedAppointment } | null>(null);
  const scheduleCancel = useScheduleAppointmentCancel();

  const pending = usePendingDeletions();
  const effective = useMemo(() => appointments.map((a) => withPendingCancel(a, pending)), [appointments, pending]);
  const now = useMemo(() => new Date(nowISO), [nowISO]);
  const rows = useMemo(
    () => buildAppointmentListRows(effective.map(toInput), now, tz, currency),
    [effective, now, tz, currency],
  );
  const filters: AppointmentListFilters = { ...urlFilters, query };
  const filtered = rows.filter((r) => matchesAppointmentFilters(r, filters));
  const cards = countAppointmentCards(filtered);
  const filtering = activeAppointmentFilterCount(filters) > 0 || query.trim() !== "";

  function writeFilters(next: AppointmentListFilters) {
    replaceUrlInRouter(turnosHref(month, currentMonth, next));
  }

  function changeQuery(value: string) {
    setQuery(value);
    writeFilters({ ...filters, query: value });
  }

  function showAll() {
    setQuery("");
    writeFilters(DEFAULT_APPOINTMENT_LIST_FILTERS);
  }

  const selected = useMemo((): SelectedAppointment | null => {
    if (!selectedId) return null;
    const dto = effective.find((a) => a.id === selectedId);
    const row = rows.find((r) => r.id === selectedId);
    if (!dto || !row) return null;
    if (override && override.source === appointments && override.appt.id === selectedId) return override.appt;
    return toSelectedAppointment(dto, row);
  }, [selectedId, effective, rows, override, appointments]);

  // El modal de pago conserva el último turno mientras dura su animación de cierre.
  const [payingShown, setPayingShown] = useState<string | null>(null);
  if (payingId && payingId !== payingShown) setPayingShown(payingId);
  const payingDto = payingShown ? effective.find((a) => a.id === payingShown) : undefined;
  const payingRow = payingShown ? rows.find((r) => r.id === payingShown) : undefined;

  function openDetail(id: string, el: HTMLElement) {
    setOverride(null);
    setOrigin(el);
    setSelectedId(id);
  }

  // T17: sin estado optimista. Si falla, la fila no cambia.
  async function closeAppointment(row: AppointmentListRow, status: "COMPLETED" | "NO_SHOW") {
    setBusy({ id: row.id, status });
    const res = await setStatusAction(row.id, status);
    setBusy(null);
    if (!res.ok) {
      notify.error(res.error ?? T.toast.error);
      return;
    }
    router.refresh();
    requestAnimationFrame(() => document.getElementById(openButtonId(row.id))?.focus());
    notify.undo(
      status === "COMPLETED" ? T.toast.completed(row.patientShortName) : AGENDA_TEXT.sheet.toastNoShow,
      async () => {
        const back = await setStatusAction(row.id, "CONFIRMED");
        if (back.ok) {
          notify.saved(AGENDA_TEXT.sheet.toastBackToConfirmed);
          router.refresh();
        } else notify.error(back.error ?? T.toast.error);
      },
    );
  }

  const rowActions: AppointmentRowActions = {
    busy,
    onOpen: openDetail,
    onCloseAppointment: (row, status) => void closeAppointment(row, status),
    onRegisterPayment: (row) => setPayingId(row.id),
  };

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
      <PageHeader
        title={T.title}
        description={T.description}
        action={
          <>
            <TurnosFilters filters={filters} services={filterServices} wide={wide} onChange={writeFilters} />
            {newAppointmentButton}
          </>
        }
      />

      <nav aria-label={T.monthNav.label} className="mb-6 flex items-center gap-1">
        <Link
          href={turnosHref(prevMonth, currentMonth, filters)}
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
          href={turnosHref(nextMonth, currentMonth, filters)}
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
              onChange={(e) => changeQuery(e.target.value)}
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
                  <Button variant="tinted" size="lg" onClick={showAll}>
                    {T.seeAll}
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={CalendarX} title={T.emptyMonth(monthName(month))} action={newAppointmentButton} />
            )}
          </div>
        ) : wide ? (
          <AppointmentsTable rows={filtered} caption={T.tableCaption(title)} actions={rowActions} />
        ) : (
          <AppointmentsMobileList rows={filtered} onOpen={openDetail} />
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

      {payingDto && payingRow ? (
        <AppointmentPaymentModal
          open={payingId !== null}
          onClose={() => setPayingId(null)}
          currency={currency}
          appointment={{
            id: payingDto.id,
            label: `${payingRow.patientLabel} · ${payingRow.serviceName} · ${appointmentDayTime(payingRow.startsAt, now, tz)}`,
            priceSnapshot: payingDto.priceSnapshot,
            patientLabel: payingRow.patientLabel,
            depositAmount: payingDto.depositAmount ?? undefined,
            balanceAmount: String(payingRow.payment.balance),
          }}
          onDone={() => {
            setPayingId(null);
            router.refresh();
          }}
        />
      ) : null}

      <AppointmentDetailDialog
        appt={selected}
        origin={origin}
        tz={tz}
        currency={currency}
        onClose={() => setSelectedId(null)}
        onChanged={() => router.refresh()}
        onUpdated={(next) => setOverride({ source: appointments, appt: next })}
        onCancel={scheduleCancel}
      />
    </div>
  );
}
