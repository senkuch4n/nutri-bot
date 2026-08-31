"use client";

import { useCallback, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, DateSelectArg } from "@fullcalendar/core";
import { Button, PageHeader, StatTile } from "@/components/ui";
import { NewAppointmentModal, type ServiceOption } from "./new-appointment-modal";
import { AppointmentDetailModal, type SelectedAppointment } from "./appointment-detail-modal";

// Referencias estables: si se crean inline en el render, FullCalendar cree que
// la config cambió y vuelve a pedir los eventos → loop infinito con `loading`.
const PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin];
const HEADER_TOOLBAR = {
  left: "prev,next today",
  center: "title",
  right: "dayGridMonth,timeGridWeek,timeGridDay",
} as const;
const BUTTON_TEXT = { today: "Hoy", month: "Mes", week: "Semana", day: "Día" } as const;
const EVENT_SOURCE = {
  url: "/api/appointments",
  method: "GET" as const,
  failure: () => console.error("No se pudieron cargar los turnos"),
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
  const [creating, setCreating] = useState(false);
  const [initialDate, setInitialDate] = useState<string | undefined>();
  const [selected, setSelected] = useState<SelectedAppointment | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(() => {
    calRef.current?.getApi().refetchEvents();
  }, []);

  const onEventClick = useCallback((arg: EventClickArg) => {
    const p = arg.event.extendedProps;
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
            + Nuevo turno
          </Button>
        }
      />

      {/* Resumen */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="Turnos hoy" value={summary.today} />
        <StatTile label="Esta semana" value={summary.week} />
        <StatTile label="Próximo turno">
          {summary.next ? (
            <p className="mt-1 truncate text-sm text-ink">
              <span className="font-display font-bold">{summary.next.time}</span>
              <span className="mx-1.5 text-ink-faint">·</span>
              {summary.next.label}
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-faint">Sin turnos próximos</p>
          )}
        </StatTile>
      </div>

      {/* Calendario */}
      <div className="relative overflow-hidden rounded-card border border-line bg-paper p-4 shadow-card">
        {loading ? (
          <span
            className="absolute inset-x-0 top-0 z-10 h-[3px] animate-pulse bg-leaf"
            role="status"
            aria-label="Cargando turnos"
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
          loading={setLoading}
          events={EVENT_SOURCE}
          buttonText={BUTTON_TEXT}
        />
      </div>

      {/* Leyenda de servicios */}
      {legend.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Servicios
          </span>
          {legend.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
              <span className="h-2.5 w-2.5" style={{ background: s.color }} />
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

      <AppointmentDetailModal
        appt={selected}
        tz={tz}
        currency={currency}
        onClose={() => setSelected(null)}
        onChanged={refetch}
      />
    </div>
  );
}
