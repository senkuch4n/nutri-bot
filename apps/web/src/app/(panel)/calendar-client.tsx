"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
// Con locale="es" (texto) FullCalendar no carga sus traducciones ("+1 more"): va el objeto del idioma.
import esLocale from "@fullcalendar/core/locales/es";
import type {
  CalendarApi,
  DatesSetArg,
  DayCellMountArg,
  EventApi,
  EventClickArg,
  EventContentArg,
  EventMountArg,
} from "@fullcalendar/core";
import {
  AGENDA_TEXT,
  calendarDayPanelTitle,
  calendarFilterHides,
  calendarPeriodTitle,
  fromZonedTime,
  type CalendarFilters as Filters,
  type CalendarView,
} from "@nutri-bot/core";
import {
  FC_VIEW,
  calendarHref,
  createCalendarReveal,
  calendarViewFromFc,
  resolveCalendarRoute,
} from "@/lib/calendar-route";
import { usePendingDeletions } from "@/lib/deferred-delete";
import { notify } from "@/lib/notify";
import { replaceUrlInRouter } from "@/lib/patient-tab-route";
import { NewAppointmentModal, type ServiceOption } from "./new-appointment-modal";
import { AppointmentDetailSheet, type SelectedAppointment } from "./appointment-detail-sheet";
import { AppointmentDetailDialog } from "./turnos/appointment-detail-dialog";
import { appointmentCancelKey, useScheduleAppointmentCancel } from "./appointment-cancel";
import { CalendarGridSkeleton, CalendarToolbar, CalendarToolbarSkeleton } from "./calendar-toolbar";
import { CalendarFilters } from "./calendar-filters";
import { AppointmentStatusDot } from "./appointment-status-dot";
import { CalendarDayPanel, type DayAppointment } from "./calendar-day-panel";

// Referencias estables: si se crean inline en el render, FullCalendar cree que
// la config cambió y vuelve a pedir los eventos → loop infinito con `loading`.
// luxonPlugin: sin él, FullCalendar no puede convertir a una zona con nombre (timeZone={tz}) y muestra UTC.
const PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin, luxonPlugin];
// "11:00" y no "11": por defecto FullCalendar omite los minutos en punto.
const EVENT_TIME_FORMAT = { hour: "numeric", minute: "2-digit", hour12: false } as const;
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

const NO_FILTERS: Filters = { hiddenServices: [], hiddenStatuses: [] };

/** Oculta los turnos con cancelación pendiente (Q6) y los que sacan los Filtros. Solo toca los que
 *  cambian: setProp dispara eventsSet, y sin esta guarda habría un loop. */
function applyVisibility(api: CalendarApi, pending: ReadonlySet<string>, filters: Filters) {
  for (const ev of api.getEvents()) {
    const p = ev.extendedProps;
    const hidden =
      pending.has(appointmentCancelKey(ev.id)) ||
      calendarFilterHides({ serviceName: String(p.serviceName), status: String(p.status) }, filters);
    const display = hidden ? "none" : "auto";
    if (ev.display !== display) ev.setProp("display", display);
  }
}

function eventClassNames(arg: EventContentArg): string[] {
  return ["appt-event", `appt-event--${String(arg.event.extendedProps.status).toLowerCase()}`];
}

/** Pastilla del turno, un renglón: punto (servicio + estado) · paciente · hora. El servicio completo
 *  queda en el nombre accesible. */
function renderEventContent(arg: EventContentArg) {
  const p = arg.event.extendedProps;
  return (
    <div className="appt-pill" title={`${p.patientLabel} · ${p.serviceName}`}>
      <AppointmentStatusDot status={String(p.status)} color={String(p.serviceColor)} />
      <span className="min-w-0 flex-1 truncate">{p.patientLabel}</span>
      <span className="shrink-0 tabular-nums">{arg.timeText}</span>
    </div>
  );
}

/** Lo que necesita el panel del turno, desde el evento del calendario. */
function selectedFromEvent(event: EventApi): SelectedAppointment {
  const p = event.extendedProps;
  return {
    id: event.id,
    start: event.startStr,
    end: event.endStr,
    status: p.status,
    patientName: p.patientName ?? null,
    patientPhone: p.patientPhone,
    serviceName: p.serviceName,
    price: p.price,
    googleSynced: p.googleSynced,
    patientId: p.patientId,
    consultation: p.consultation ?? null,
    reason: p.reason ?? null,
    patientJid: p.patientJid,
    patientLabel: p.patientLabel,
    hasFullPayment: Boolean(p.hasFullPayment),
  };
}

/** Turnos visibles de un día (los ocultos por Filtros o por una cancelación pendiente no van). */
function dayAppointments(events: readonly EventApi[], dayKey: string): DayAppointment[] {
  return events
    .filter((ev) => ev.display !== "none" && ev.startStr.slice(0, 10) === dayKey)
    .sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0))
    .map((ev) => {
      const p = ev.extendedProps;
      return {
        id: ev.id,
        start: ev.startStr,
        end: ev.endStr,
        status: String(p.status),
        patientLabel: String(p.patientLabel),
        serviceName: String(p.serviceName),
        serviceColor: String(p.serviceColor),
        hasFullPayment: Boolean(p.hasFullPayment),
        hasNote: Boolean(p.reason),
      };
    });
}

// Ícono "agrandar" (Maximize2 de lucide) para el botón que FullCalendar no deja poner con JSX en la casilla.
const EXPAND_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/></svg>';

function isActivationKey(e: KeyboardEvent) {
  return e.key === "Enter" || e.key === " ";
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
  const [view, setView] = useState<CalendarView>("mes");
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  // Casilla del día (Mes) desde la que crece "Nuevo turno". No se limpia al cerrar: el diálogo la
  // necesita para volver a ella en la animación de salida.
  const [createOrigin, setCreateOrigin] = useState<HTMLElement | null>(null);
  // Pastilla del turno desde la que crece su detalle (escritorio); tampoco se limpia al cerrar.
  const [detailOrigin, setDetailOrigin] = useState<HTMLElement | null>(null);
  const [initialDate, setInitialDate] = useState<string | undefined>();
  const [initialStart, setInitialStart] = useState<string | undefined>();
  const [selected, setSelected] = useState<SelectedAppointment | null>(null);
  const [loading, setLoading] = useState(false);
  // Eventos que cargó el calendario (para el panel del día).
  const [calEvents, setCalEvents] = useState<EventApi[]>([]);
  // Panel del día: el día y la casilla se conservan al cerrar (animación de salida).
  const [dayOpen, setDayOpen] = useState(false);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [dayOrigin, setDayOrigin] = useState<HTMLElement | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const pendingDeletions = usePendingDeletions();
  const pendingRef = useRef(pendingDeletions);
  pendingRef.current = pendingDeletions;

  useEffect(() => {
    const api = calRef.current?.getApi();
    if (api) applyVisibility(api, pendingDeletions, filters);
  }, [pendingDeletions, filters, mounted]);

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
    // changeView(tipo, fecha) en FullCalendar 6 deja como fecha actual el inicio del período: se separa.
    if (api.view.type !== FC_VIEW[route.view]) api.changeView(FC_VIEW[route.view]);
    api.gotoDate(route.dayKey);
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

  // Entrada del calendario (cada vez que se entra a la página): las pastillas aparecen en orden, de
  // borrosas a nítidas. Solo la primera carga; refrescos y cambios de mes, sin animación.
  // Se cierra dos cuadros después de montar la primera pastilla: para entonces ya se montó toda la tanda.
  const revealRef = useRef<ReturnType<typeof createCalendarReveal> | null>(null);
  revealRef.current ??= createCalendarReveal((fn) => requestAnimationFrame(() => requestAnimationFrame(fn)));
  const onEventDidMount = useCallback((arg: EventMountArg) => {
    if (prefersReducedMotion()) return;
    const delay = revealRef.current?.next() ?? null;
    if (delay === null) return;
    const el = arg.el;
    el.style.setProperty("--reveal-delay", `${delay}ms`);
    el.classList.add("appt-reveal");
    // Sin la clase después: la animación ya no pisa la opacidad del hover.
    el.addEventListener("animationend", () => el.classList.remove("appt-reveal"), { once: true });
  }, []);

  const onEventsSet = useCallback((events: EventApi[]) => {
    setCalEvents([...events]);
    const api = calRef.current?.getApi();
    if (api) applyVisibility(api, pendingRef.current, filtersRef.current);
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
    lastEventElRef.current = arg.el;
    setDetailOrigin(arg.el);
    setSelected(selectedFromEvent(arg.event));
  }, []);

  // Panel del día: crece desde la casilla (su marco redondeado) del día elegido.
  const openDay = useCallback((key: string, cell: HTMLElement) => {
    setSelected(null);
    setDayKey(key);
    setDayOrigin(cell.querySelector<HTMLElement>(".fc-daygrid-day-frame") ?? cell);
    setDayOpen(true);
  }, []);
  const openDayRef = useRef(openDay);
  openDayRef.current = openDay;

  // Botón "agrandar" en cada casilla del Mes. El clic con el mouse ya lo atiende dateClick (toda la
  // casilla abre el día); el botón suma el acceso por teclado y el nombre accesible.
  const onDayCellDidMount = useCallback(
    (arg: DayCellMountArg) => {
      if (arg.view.type !== FC_VIEW.mes) return;
      const key = arg.el.getAttribute("data-date");
      const frame = arg.el.querySelector<HTMLElement>(".fc-daygrid-day-frame");
      if (!key || !frame) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "day-expand";
      button.setAttribute("aria-label", `${AGENDA_TEXT.dayPanel.expand}: ${calendarDayPanelTitle(key, todayKey)}`);
      button.innerHTML = EXPAND_ICON;
      button.addEventListener("click", (e) => {
        if (e.detail === 0) openDayRef.current(key, arg.el); // teclado (Enter/Espacio)
      });
      frame.appendChild(button);
    },
    [todayKey],
  );

  // "+N más" abre el mismo panel en vez del popover de FullCalendar. FullCalendar (Preact) escucha el clic
  // en el mismo link y con una función igual abre su popover: se corta en captura, desde el contenedor.
  useEffect(() => {
    const area = calendarAreaRef.current;
    if (!area || !mounted) return;
    const intercept = (e: Event) => {
      if (e instanceof KeyboardEvent && !isActivationKey(e)) return;
      const link = (e.target as HTMLElement | null)?.closest?.(".fc-more-link");
      const cell = link?.closest<HTMLElement>("td[data-date]");
      const key = cell?.getAttribute("data-date");
      if (!cell || !key) return;
      e.preventDefault();
      e.stopPropagation();
      openDayRef.current(key, cell);
    };
    area.addEventListener("click", intercept, true);
    area.addEventListener("keydown", intercept, true);
    return () => {
      area.removeEventListener("click", intercept, true);
      area.removeEventListener("keydown", intercept, true);
    };
  }, [mounted]);

  const dayItems = useMemo(() => (dayKey ? dayAppointments(calEvents, dayKey) : []), [calEvents, dayKey]);

  // D5: el turno se oculta al instante; la cancelación (y el WhatsApp) salen al vencer el "Deshacer".
  // Como el turno ya no se ve, al cerrarse el panel el foco va al título de la barra.
  const scheduleAppointmentCancel = useScheduleAppointmentCancel({ onCommitted: refetch });
  const scheduleCancel = useCallback(
    (appt: SelectedAppointment) => {
      lastEventElRef.current = titleRef.current;
      scheduleAppointmentCancel(appt);
    },
    [scheduleAppointmentCancel],
  );

  // Mes: tocar una casilla abre el panel del día. Semana/Día (Q4): un toque en una franja abre
  // "Nuevo turno" con ese horario.
  const onDateClick = useCallback(
    (arg: DateClickArg) => {
      if (arg.view.type === FC_VIEW.mes) {
        openDay(arg.dateStr.slice(0, 10), arg.dayEl);
        return;
      }
      setSelected(null);
      setInitialDate(arg.dateStr.slice(0, 10));
      setInitialStart(arg.allDay ? undefined : isoFromDateStr(arg.dateStr, tz));
      setCreateOrigin(null);
      setCreating(true);
    },
    [tz, openDay],
  );

  const withApi = (fn: (api: CalendarApi) => void) => {
    const api = calRef.current?.getApi();
    if (api) fn(api);
  };

  return (
    <div>
      {/* Sin encabezado ni resumen (2026-10-31): el título del período es la cabecera visible. */}
      <h1 className="sr-only">Calendario</h1>

      {/* Calendario */}
      <div ref={calendarAreaRef} className="relative">
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
              filters={<CalendarFilters services={legend} filters={filters} wide={mounted.wide} onChange={setFilters} />}
            />
            <FullCalendar
              ref={calRef}
              plugins={PLUGINS}
              initialView={FC_VIEW[mounted.view]}
              initialDate={mounted.dayKey}
              headerToolbar={false}
              locale={esLocale}
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
              eventDisplay="block"
              displayEventEnd={false}
              eventTimeFormat={EVENT_TIME_FORMAT}
              eventClassNames={eventClassNames}
              eventContent={renderEventContent}
              eventDidMount={onEventDidMount}
              dateClick={onDateClick}
              dayCellDidMount={onDayCellDidMount}
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

      <CalendarDayPanel
        open={dayOpen}
        dayKey={dayKey}
        origin={dayOrigin}
        wide={mounted?.wide ?? true}
        todayKey={todayKey}
        tz={tz}
        slotMin={slotMin}
        slotMax={slotMax}
        items={dayItems}
        onClose={() => setDayOpen(false)}
        onCreate={(key, from) => {
          setInitialDate(key);
          setInitialStart(undefined);
          setCreateOrigin(from);
          setCreating(true);
        }}
        onOpenAppointment={(id, from) => {
          const ev = calRef.current?.getApi().getEventById(id);
          if (!ev) return;
          lastEventElRef.current = from;
          setDetailOrigin(from);
          setSelected(selectedFromEvent(ev));
        }}
      />

      <NewAppointmentModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={refetch}
        services={services}
        tz={tz}
        todayKey={todayKey}
        initialDate={initialDate}
        initialStart={initialStart}
        origin={createOrigin}
      />

      {/* Escritorio: la pastilla se transforma en su detalle, en su lugar. Celular: la hoja de siempre. */}
      {mounted?.wide ? (
        <AppointmentDetailDialog
          appt={selected}
          origin={detailOrigin}
          anchored
          tz={tz}
          currency={currency}
          onClose={() => setSelected(null)}
          onChanged={refetch}
          onUpdated={setSelected}
          onCancel={scheduleCancel}
        />
      ) : (
        <AppointmentDetailSheet
          appt={selected}
          tz={tz}
          currency={currency}
          onClose={() => setSelected(null)}
          onChanged={refetch}
          onUpdated={setSelected}
          onCancel={scheduleCancel}
          interactionAreaRef={calendarAreaRef}
          returnFocusRef={lastEventElRef}
        />
      )}
    </div>
  );
}
