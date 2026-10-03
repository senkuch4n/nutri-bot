"use client";

import { useEffect, useState } from "react";
import type { EventInput } from "@fullcalendar/core";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { chartPalette } from "@/lib/design-tokens";
import { DemoSection } from "./section";

// Referencias estables (igual que calendar-client.tsx).
const PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin];
const HEADER_TOOLBAR = { left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" } as const;
const BUTTON_TEXT = { today: "Hoy", month: "Mes", week: "Semana", day: "Día" } as const;
const BUSINESS_HOURS = { daysOfWeek: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "18:00" };

function at(monday: Date, dayOffset: number, hh: number, mm: number) {
  const d = new Date(monday);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hh, mm, 0, 0);
  return d;
}

/** Calendario con eventos literales (no lee la base): solo para ver el tema. */
export function CalendarSection() {
  // Fechas relativas a hoy: se calculan en el cliente para no desfasar la hidratación.
  const [events, setEvents] = useState<EventInput[]>([]);
  useEffect(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const [blue, green, orange, violet] = chartPalette.series;
    const ev = (title: string, day: number, h: number, m: number, minutes: number, color: string) => {
      const start = at(monday, day, h, m);
      return { title, start, end: new Date(start.getTime() + minutes * 60_000), backgroundColor: color, borderColor: color };
    };
    setEvents([
      ev("María López · Control", 0, 9, 0, 40, blue),
      ev("Brenda Yebara · ISAK", 0, 11, 0, 60, violet),
      ev("Lucía Fernández · Primera", 1, 10, 0, 60, green),
      ev("Sofía Martínez · Control", 2, 15, 0, 40, blue),
      ev("Camila Ruiz · Primera", 3, 9, 40, 60, green),
      ev("Julieta Díaz · Control", 4, 16, 20, 40, orange),
    ]);
  }, []);

  return (
    <DemoSection
      id="calendario"
      index={13}
      title="Calendario"
      description="Tema de FullCalendar desde los tokens: botones gray, el activo como segmento elevado, hoy con un tinte casi imperceptible. Los colores de los turnos son dato (servicio)."
    >
      <div className="rounded-xl bg-card p-4 shadow-card">
        <FullCalendar
          plugins={PLUGINS}
          initialView="timeGridWeek"
          headerToolbar={HEADER_TOOLBAR}
          buttonText={BUTTON_TEXT}
          locale="es"
          firstDay={1}
          nowIndicator
          allDaySlot={false}
          slotDuration="00:30:00"
          slotMinTime="08:00:00"
          slotMaxTime="19:00:00"
          businessHours={BUSINESS_HOURS}
          expandRows
          height="auto"
          events={events}
          eventInteractive
        />
      </div>
    </DemoSection>
  );
}
