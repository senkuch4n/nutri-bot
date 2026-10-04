"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import type { CalendarApi, DatesSetArg, EventApi, EventClickArg } from "@fullcalendar/core";
import { Plus } from "lucide-react";
import {
  AGENDA_TEXT,
  APPOINTMENT_STATUS_TEXT,
  calendarPeriodTitle,
  fromZonedTime,
  type CalendarView,
} from "@nutri-bot/core";
import { Button, PageHeader } from "@/components/ui";
import {
  FC_VIEW,
  calendarHref,
  calendarViewFromFc,
  resolveCalendarRoute,
} from "@/lib/calendar-route";
import { notify } from "@/lib/notify";
import { replaceUrlInRouter } from "@/lib/patient-tab-route";
import { NewAppointmentModal, type ServiceOption } from "./new-appointment-modal";
import { AppointmentDetailSheet, type SelectedAppointment } from "./appointment-detail-sheet";
import { CalendarGridSkeleton, CalendarToolbar, CalendarToolbarSkeleton } from "./calendar-toolbar";

// Referencias estables: si se crean inline en el render, FullCalendar cree que
// la config cambió y vuelve a pedir los eventos → loop infinito con `loading`.
// luxonPlugin: sin él, FullCalendar no puede convertir a una zona con nombre (timeZone={tz}) y muestra UTC.
const PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin, luxonPlugin];
const EVENT_SOURCE = {
  url: "/api/appointments",
  method: "GET" as const,
  failure: () => notify.error(AGENDA_TEXT.loadError),
};

interface BusinessHours {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
}

/** Textos ya armados en el servidor (solo datos, T9a). */
interface Summary {
  todayText: string;
  weekText: string;
  nextText: string | null;
}

/** Lo que se resolvió al montar: el ancho no se vuelve a leer (Q15). */
interface Mounted {
  wide: boolean;
  view: CalendarView;
  dayKey: string;
  /** ?fecha= válida en Día al entrar: el primer turno del día se trae a la vista una vez (Q5). */
  scrollToFirst: boolean;
}

/** ISO con zona a partir del `dateStr` de FullCalendar (con offset cuando la zona tiene nombre). */
function isoFromDateStr(dateStr: string, tz: string): string {
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(dateStr);
  return (hasOffset ? new Date(dateStr) : fromZonedTime(dateStr, tz)).toISOString();
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function CalendarClient({
  services,
  legend,
  tz,
  currency,
  todayKey,
  summary,
  businessHours,
  slotMin,
  slotMax,
}: {
  services: ServiceOption[];
  legend: { name: string; color: string }[];
  tz: string;
  currency: string;
  /** "yyyy-MM-dd" de hoy en la zona de la profesional. */
  todayKey: string;
  summary: Summary;
  businessHours: BusinessHours[];
  slotMin: string;
  slotMax: string;
}) {
  const searchParams = useSearchParams();
  const searchString = searchParams.toString();

  const calRef = useRef<FullCalendar>(null);
  // Área del calendario: los clics adentro no cierran el panel del turno (se puede elegir otro).
  const calendarAreaRef = useRef<HTMLDivElement>(null);
  // Último turno tocado: al cerrar el panel, el foco vuelve ahí.
  const lastEventElRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Última query que escribió el calendario: un cambio de URL igual a esta es propio y se ignora.
  const lastQueryRef = useRef<string | null>(null);

  const [mounted, setMounted] = useState<Mounted | null>(null);
  const mountedRef = useRef<Mounted | null>(null);
  const scrollPendingRef = useRef(false);
  const [view, setView] = useState<CalendarView>("semana");
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [initialDate, setInitialDate] = useState<string | undefined>();
  const [initialStart, setInitialStart] = useState<string | undefined>();
  const [selected, setSelected] = useState<SelectedAppointment | null>(null);
  const [loading, setLoading] = useState(false);

  // Montaje solo en el cliente (Q1): recién acá se conoce el ancho; mientras, el esqueleto.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 768px)").matches;
    const params = new URLSearchParams(window.location.search);
    const fecha = params.get("fecha");
    const route = resolveCalendarRoute({ fecha, vista: params.get("vista") }, { todayKey, wide });
    const m: Mounted = { wide, ...route, scrollToFirst: route.view === "dia" && route.dayKey === fecha };
    mountedRef.current = m;
    scrollPendingRef.current = m.scrollToFirst;
    lastQueryRef.current = params.toString();
    setView(route.view);
    setMounted(m);
    // Solo al montar: después, la URL la sigue el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // La URL cambió desde afuera (p. ej. "Calendario" en la sidebar estando acá): se vuelve a resolver.
  useEffect(() => {
    const m = mountedRef.current;
    const api = calRef.current?.getApi();
    if (!m || !api || searchString === lastQueryRef.current) return;
    const route = resolveCalendarRoute(
      { fecha: searchParams.get("fecha"), vista: searchParams.get("vista") },
      { todayKey, wide: m.wide },
    );
    lastQueryRef.current = searchString;
    if (api.view.type !== FC_VIEW[route.view]) api.changeView(FC_VIEW[route.view], route.dayKey);
    else api.gotoDate(route.dayKey);
  }, [searchString, searchParams, todayKey]);

  const refetch = useCallback(() => {
    calRef.current?.getApi().refetchEvents();
  }, []);

  // datesSet: carga y cada navegación → título del período y URL (D2), fuera de cualquier setState.
  const onDatesSet = useCallback(
    (arg: DatesSetArg) => {
      const m = mountedRef.current;
      if (!m) return;
      const api = arg.view.calendar;
      const nextView = calendarViewFromFc(arg.view.type);
      const dayKey = api.formatIso(api.getDate(), true);
      setView(nextView);
      setTitle(
        calendarPeriodTitle(
          nextView,
          api.formatIso(arg.view.currentStart, true),
          api.formatIso(arg.view.currentEnd, true),
          todayKey,
        ),
      );
      if (scrollPendingRef.current && (nextView !== "dia" || dayKey !== m.dayKey)) scrollPendingRef.current = false;
      const href = calendarHref(window.location.href, { view: nextView, dayKey }, { todayKey, wide: m.wide });
      lastQueryRef.current = new URL(href).searchParams.toString();
      replaceUrlInRouter(href);
    },
    [todayKey],
  );

  const onEventsSet = useCallback((events: EventApi[]) => {
    // Deep link (Q5): el primer turno del día, a la vista una sola vez (y solo si no se ve ya).
    if (!scrollPendingRef.current || events.length === 0) return;
    scrollPendingRef.current = false;
    requestAnimationFrame(() => {
      const els = Array.from(calendarAreaRef.current?.querySelectorAll<HTMLElement>(".fc-timegrid-event") ?? []);
      const first = els.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
      if (!first) return;
      const rect = first.getBoundingClientRect();
      if (rect.top >= 0 && rect.bottom <= window.innerHeight) return;
      first.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
  }, []);

  const onEventClick = useCallback((arg: EventClickArg) => {
    const p = arg.event.extendedProps;
    lastEventElRef.current = arg.el;
    setSelected({
      id: arg.event.id,
      start: arg.event.startStr,
      end: arg.event.endStr,
      status: p.status,
      patientName: p.patientName ?? null,
      patientPhone: p.patientPhone,
      serviceName: p.serviceName,
      price: p.price,
      googleSynced: p.googleSynced,
      patientId: p.patientId,
      consultation: p.consultation ?? null,
      reason: p.reason ?? null,
    });
  }, []);

  // Q4: un toque (sin mantener apretado) en una franja abre "Nuevo turno" con ese horario.
  const onDateClick = useCallback(
    (arg: DateClickArg) => {
      setSelected(null);
      setInitialDate(arg.dateStr.slice(0, 10));
      setInitialStart(arg.allDay ? undefined : isoFromDateStr(arg.dateStr, tz));
      setCreating(true);
    },
    [tz],
  );

  const withApi = (fn: (api: CalendarApi) => void) => {
    const api = calRef.current?.getApi();
    if (api) fn(api);
  };

  return (
    <div>
      <PageHeader
        title="Calendario"
        action={
          <Button
            onClick={() => {
              setInitialDate(undefined);
              setInitialStart(undefined);
              setCreating(true);
            }}
          >
            <Plus aria-hidden />
            Nuevo turno
          </Button>
        }
      />

      {/* Franja de resumen en palabras (D8, Q11): en el celular se apila, sin cortar el nombre. */}
      <dl
        aria-label="Resumen de turnos"
        className="mb-4 flex flex-col gap-y-1.5 rounded-lg border bg-card px-4 py-3 text-callout sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-6"
      >
        <div className="tabular-nums">
          <dt className="sr-only">Turnos de hoy</dt>
          <dd className="font-semibold">{summary.todayText}</dd>
        </div>
        <div className="tabular-nums">
          <dt className="sr-only">Turnos de esta semana</dt>
          <dd>{summary.weekText}</dd>
        </div>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <dt className="text-muted-foreground">{AGENDA_TEXT.next}:</dt>
          <dd className={summary.nextText ? "min-w-0 break-words" : "text-muted-foreground"}>
            {summary.nextText ?? AGENDA_TEXT.noNext}
          </dd>
        </div>
      </dl>

      {/* Calendario */}
      <div ref={calendarAreaRef} className="relative overflow-hidden rounded-lg border bg-card p-4">
        {loading ? (
          <span
            role="status"
            aria-label={AGENDA_TEXT.loading}
            className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-primary"
          />
        ) : null}
        {mounted ? (
          <>
            <CalendarToolbar
              view={view}
              title={title}
              titleRef={titleRef}
              onPrev={() => withApi((api) => api.prev())}
              onNext={() => withApi((api) => api.next())}
              onToday={() => withApi((api) => api.today())}
              onViewChange={(v) => withApi((api) => api.changeView(FC_VIEW[v]))}
            />
            <FullCalendar
              ref={calRef}
              plugins={PLUGINS}
              initialView={FC_VIEW[mounted.view]}
              initialDate={mounted.dayKey}
              headerToolbar={false}
              locale="es"
              firstDay={1}
              nowIndicator
              allDaySlot={false}
              slotDuration="00:30:00"
              slotMinTime={slotMin}
              slotMaxTime={slotMax}
              businessHours={businessHours}
              expandRows
              height="auto"
              timeZone={tz}
              dayMaxEvents={3}
              dateClick={onDateClick}
              eventClick={onEventClick}
              eventInteractive
              datesSet={onDatesSet}
              eventsSet={onEventsSet}
              loading={setLoading}
              events={EVENT_SOURCE}
            />
          </>
        ) : (
          <>
            <CalendarToolbarSkeleton />
            <CalendarGridSkeleton />
          </>
        )}
      </div>

      {/* Leyenda: color del servicio (dato) y de los estados cerrados (Q22) */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-footnote text-muted-foreground">
        {legend.length > 0 ? (
          <>
            <span className="font-medium text-foreground">{AGENDA_TEXT.legendServices}</span>
            {legend.map((s) => (
              <span key={s.name} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                {s.name}
              </span>
            ))}
          </>
        ) : null}
        <span className="font-medium text-foreground">{AGENDA_TEXT.legendStates}</span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-success" />
          {APPOINTMENT_STATUS_TEXT.COMPLETED}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-destructive" />
          {APPOINTMENT_STATUS_TEXT.NO_SHOW}
        </span>
      </div>

      <NewAppointmentModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={refetch}
        services={services}
        tz={tz}
        initialDate={initialDate}
        initialStart={initialStart}
      />

      <AppointmentDetailSheet
        appt={selected}
        tz={tz}
        currency={currency}
        onClose={() => setSelected(null)}
        onChanged={refetch}
        onUpdated={setSelected}
        interactionAreaRef={calendarAreaRef}
        returnFocusRef={lastEventElRef}
      />
    </div>
  );
}
