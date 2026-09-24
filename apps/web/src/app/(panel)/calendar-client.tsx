"use client";

import { useCallback, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import type { EventClickArg, DateSelectArg } from "@fullcalendar/core";
import { Plus } from "lucide-react";
import { Separator } from "@/components/primitives/separator";
import { Button, PageHeader } from "@/components/ui";
import { notify } from "@/lib/notify";
import { NewAppointmentModal, type ServiceOption } from "./new-appointment-modal";
import { AppointmentDetailSheet, type SelectedAppointment } from "./appointment-detail-sheet";

// Referencias estables: si se crean inline en el render, FullCalendar cree que
// la config cambió y vuelve a pedir los eventos → loop infinito con `loading`.
// luxonPlugin: sin él, FullCalendar no puede convertir a una zona con nombre (timeZone={tz}) y muestra UTC.
const PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin, luxonPlugin];
const HEADER_TOOLBAR = {
  left: "prev,next today",
  center: "title",
  right: "dayGridMonth,timeGridWeek,timeGridDay",
} as const;
const BUTTON_TEXT = { today: "Hoy", month: "Mes", week: "Semana", day: "Día" } as const;
const EVENT_SOURCE = {
  url: "/api/appointments",
  method: "GET" as const,
  failure: () => notify.error("No se pudieron cargar los turnos."),
};

interface BusinessHours {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
}

interface Summary {
  today: number;
  week: number;
  next: { time: string; label: string } | null;
}

export function CalendarClient({
  services,
  legend,
  tz,
  currency,
  summary,
  businessHours,
  slotMin,
  slotMax,
}: {
  services: ServiceOption[];
  legend: { name: string; color: string }[];
  tz: string;
  currency: string;
  summary: Summary;
  businessHours: BusinessHours[];
  slotMin: string;
  slotMax: string;
}) {
  const calRef = useRef<FullCalendar>(null);
  // Área del calendario: los clics adentro no cierran el panel del turno (se puede elegir otro).
  const calendarAreaRef = useRef<HTMLDivElement>(null);
  // Último turno tocado: al cerrar el panel, el foco vuelve ahí.
  const lastEventElRef = useRef<HTMLElement | null>(null);
  const [creating, setCreating] = useState(false);
  const [initialDate, setInitialDate] = useState<string | undefined>();
  const [selected, setSelected] = useState<SelectedAppointment | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(() => {
    calRef.current?.getApi().refetchEvents();
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
    });
  }, []);

  const onSelect = useCallback((arg: DateSelectArg) => {
    setSelected(null);
    setInitialDate(arg.startStr.slice(0, 10));
    setCreating(true);
    arg.view.calendar.unselect();
  }, []);

  return (
    <div>
      <PageHeader
        title="Calendario"
        description="Turnos confirmados, completados y ausencias."
        action={
          <Button
            onClick={() => {
              setInitialDate(undefined);
              setCreating(true);
            }}
          >
            <Plus aria-hidden />
            Nuevo turno
          </Button>
        }
      />

      {/* Franja de resumen (reordenamiento 4): una línea en vez de tres tarjetas */}
      <dl
        aria-label="Resumen de turnos"
        className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-2.5 text-sm"
      >
        <div className="flex min-w-0 items-baseline gap-2">
          <dt className="text-muted-foreground">Turnos hoy</dt>
          <dd className="font-semibold tabular-nums">{summary.today}</dd>
        </div>
        <Separator orientation="vertical" className="hidden h-4 sm:block" />
        <div className="flex min-w-0 items-baseline gap-2">
          <dt className="text-muted-foreground">Esta semana</dt>
          <dd className="font-semibold tabular-nums">{summary.week}</dd>
        </div>
        <Separator orientation="vertical" className="hidden h-4 sm:block" />
        <div className="flex min-w-0 items-baseline gap-2">
          <dt className="text-muted-foreground">Próximo turno</dt>
          <dd className="min-w-0 truncate font-normal">
            {summary.next ? (
              <>
                <span className="font-semibold tabular-nums">{summary.next.time}</span>
                <span className="mx-1.5 text-muted-foreground">·</span>
                <span>{summary.next.label}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Sin turnos próximos</span>
            )}
          </dd>
        </div>
      </dl>

      {/* Calendario */}
      <div ref={calendarAreaRef} className="relative overflow-hidden rounded-lg border bg-card p-4">
        {loading ? (
          <span
            role="status"
            aria-label="Cargando turnos"
            className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-primary"
          />
        ) : null}
        <FullCalendar
          ref={calRef}
          plugins={PLUGINS}
          initialView="timeGridWeek"
          headerToolbar={HEADER_TOOLBAR}
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
          selectable
          select={onSelect}
          eventClick={onEventClick}
          eventInteractive
          loading={setLoading}
          events={EVENT_SOURCE}
          buttonText={BUTTON_TEXT}
        />
      </div>

      {/* Leyenda de servicios (el color es un dato del servicio) */}
      {legend.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Servicios</span>
          {legend.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      ) : null}

      <NewAppointmentModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={refetch}
        services={services}
        tz={tz}
        initialDate={initialDate}
      />

      <AppointmentDetailSheet
        appt={selected}
        tz={tz}
        currency={currency}
        onClose={() => setSelected(null)}
        onChanged={refetch}
        interactionAreaRef={calendarAreaRef}
        returnFocusRef={lastEventElRef}
      />
    </div>
  );
}
