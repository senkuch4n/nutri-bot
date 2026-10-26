"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarX, ChevronLeft, ChevronRight, Plus, SearchX } from "lucide-react";
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
import { Button, EmptyState, cn } from "@/components/ui";
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

/** ‹ › del selector de mes: chico y discreto (44 px de objetivo táctil con puntero grueso). */
const monthNavButton =
  "relative inline-flex size-8 items-center justify-center rounded-full text-muted-foreground press-none touch-target transition-colors duration-hover hover:bg-overlay-hover hover:text-foreground pressed:bg-overlay-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const countFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** HU-021 V1. Tarjeta gris suave: etiqueta chica arriba y número grande abajo. */
function StatCard({
  label,
  value,
  caption,
  primary = false,
}: {
  label: string;
  value: number;
  caption?: string;
  /** «Totales»: la etiqueta va en el color del texto, no en gris. */
  primary?: boolean;
}) {
  return (
    <div className="rounded-xl bg-muted px-5 py-4 sm:px-6 sm:py-5 more-contrast:border more-contrast:border-input">
      <p className={cn("text-subheadline", primary ? "text-foreground" : "text-muted-foreground")}>{label}</p>
      <p className="mt-1 text-metric-md font-medium tabular-nums">{countFormat.format(value)}</p>
      {caption ? <p className="mt-0.5 text-footnote text-muted-foreground">{caption}</p> : null}
    </div>
  );
}

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

/** HU-021 (SDD 7.1 + V1). Pantalla "Turnos": encabezado con mes y «Filtros», tarjetas y lista del mes. Toda
 *  la derivación es de core. */
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
    <Button
      className="rounded-full bg-foreground text-background hover:bg-foreground/85 pressed:bg-foreground/75"
      onClick={() => setCreating(true)}
    >
      <Plus aria-hidden />
      {T.newAppointment}
    </Button>
  );

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
          <h1 className="text-title-1 font-medium">{T.title}</h1>
          <nav aria-label={T.monthNav.label} className="flex items-center">
            <Link
              href={turnosHref(prevMonth, currentMonth, filters)}
              className={monthNavButton}
              aria-label={T.monthNav.prev(monthTitle(prevMonth))}
              title="Mes anterior"
            >
              <ChevronLeft className="size-4" strokeWidth={2} aria-hidden />
            </Link>
            <h2 className="min-w-32 text-center text-subheadline tabular-nums text-muted-foreground" aria-live="polite">
              {title}
            </h2>
            <Link
              href={turnosHref(nextMonth, currentMonth, filters)}
              className={monthNavButton}
              aria-label={T.monthNav.next(monthTitle(nextMonth))}
              title="Mes siguiente"
            >
              <ChevronRight className="size-4" strokeWidth={2} aria-hidden />
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <TurnosFilters
            filters={filters}
            services={filterServices}
            wide={wide}
            resultCount={filtered.length}
            onChange={writeFilters}
            onQueryChange={changeQuery}
          />
          {newAppointmentButton}
        </div>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label={T.cards.total}
          value={cards.total}
          caption={cards.unclosed > 0 ? T.cards.unclosed(cards.unclosed) : undefined}
          primary
        />
        <StatCard label={T.cards.pending} value={cards.pending} />
        <StatCard label={T.cards.completed} value={cards.completed} />
        <StatCard label={T.cards.cancelled} value={cards.cancelled} />
      </div>

      <section aria-label={T.tableCaption(title)}>
        {/* El contador ya no se ve en la pantalla (vive en el pie de «Filtros»), pero se sigue anunciando. */}
        <p className="sr-only" aria-live="polite">
          {T.count(filtered.length)}
        </p>

        {filtered.length === 0 ? (
          <div className="border-t border-border/60">
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
