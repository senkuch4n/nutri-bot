"use client";

import { useCallback, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, DateSelectArg } from "@fullcalendar/core";
import { Button } from "@/components/ui";
import { NewAppointmentModal, type ServiceOption } from "./new-appointment-modal";
import { AppointmentDetailModal, type SelectedAppointment } from "./appointment-detail-modal";

export function CalendarClient({
  services,
  tz,
  currency,
}: {
  services: ServiceOption[];
  tz: string;
  currency: string;
}) {
  const calRef = useRef<FullCalendar>(null);
  const [creating, setCreating] = useState(false);
  const [initialDate, setInitialDate] = useState<string | undefined>();
  const [selected, setSelected] = useState<SelectedAppointment | null>(null);

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
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => {
            setInitialDate(undefined);
            setCreating(true);
          }}
        >
          + Nuevo turno
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          locale="es"
          firstDay={1}
          nowIndicator
          allDaySlot={false}
          slotMinTime="07:00:00"
          slotMaxTime="22:00:00"
          height="auto"
          timeZone={tz}
          selectable
          select={onSelect}
          eventClick={onEventClick}
          events={{
            url: "/api/appointments",
            method: "GET",
            failure: () => console.error("No se pudieron cargar los turnos"),
          }}
          buttonText={{ today: "Hoy", month: "Mes", week: "Semana", day: "Día" }}
        />
      </div>

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
