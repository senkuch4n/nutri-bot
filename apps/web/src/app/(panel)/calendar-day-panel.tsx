"use client";

import { useState } from "react";
import { BanknoteX, CalendarClock, FileText, Plus, Rows3, type LucideIcon } from "lucide-react";
import {
  AGENDA_TEXT,
  calendarDayPanelTitle,
  dayTimelineBlock,
  dayTimelineRange,
  formatTime,
  minutesOfDay,
} from "@nutri-bot/core";
import {
  MorphDialog,
  MorphDialogContent,
  MorphDialogHeader,
  MorphDialogTitle,
} from "@/components/primitives/morph-dialog";
import { Button } from "@/components/primitives/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/primitives/sheet";
import { SegmentedControl, type SegmentedOption } from "@/components/segmented-control";
import { cn } from "@/lib/utils";
import { AppointmentStatusDot } from "./appointment-status-dot";

const T = AGENDA_TEXT.dayPanel;

/** Un turno del día, ya armado desde los eventos que cargó el calendario. */
export interface DayAppointment {
  id: string;
  /** ISO con el offset de la zona de la profesional (como lo da FullCalendar). */
  start: string;
  end: string;
  status: string;
  patientLabel: string;
  serviceName: string;
  serviceColor: string;
  hasFullPayment: boolean;
  hasNote: boolean;
}

type Tab = "lista" | "agenda";
const TAB_OPTIONS: ReadonlyArray<SegmentedOption<Tab>> = [
  { value: "lista", label: T.list, icon: Rows3 },
  { value: "agenda", label: T.agenda, icon: CalendarClock },
];
// Alto de cada hora en la agenda del panel.
const HOUR_PX = 64;

/**
 * Panel del día (vista Mes): la casilla se transforma en un panel acoplado a la derecha, con los turnos
 * del día en lista o en agenda. Desde el «+» se crea un turno ese día y cada turno abre su detalle.
 * En el celular, el mismo contenido va en una hoja inferior.
 */
export function CalendarDayPanel({
  open,
  dayKey,
  origin,
  wide,
  todayKey,
  tz,
  slotMin,
  slotMax,
  items,
  onClose,
  onCreate,
  onOpenAppointment,
}: {
  open: boolean;
  /** "yyyy-MM-dd" del día; se conserva al cerrar para la animación de salida. */
  dayKey: string | null;
  origin: HTMLElement | null;
  wide: boolean;
  todayKey: string;
  tz: string;
  slotMin: string;
  slotMax: string;
  items: DayAppointment[];
  onClose: () => void;
  onCreate: (dayKey: string, from: HTMLElement) => void;
  onOpenAppointment: (id: string, from: HTMLElement) => void;
}) {
  const [tab, setTab] = useState<Tab>("lista");
  const title = dayKey ? calendarDayPanelTitle(dayKey, todayKey) : "";
  const onOpenChange = (o: boolean) => {
    if (!o) onClose();
  };

  const plus = (
    <Button
      type="button"
      size="icon-lg"
      className="shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/85"
      aria-label={T.newHere}
      onClick={(e) => dayKey && onCreate(dayKey, e.currentTarget)}
    >
      <Plus aria-hidden />
    </Button>
  );

  const body = (
    <>
      <SegmentedControl
        value={tab}
        onValueChange={setTab}
        options={TAB_OPTIONS}
        aria-label={T.tabsLabel}
        size="lg"
        fullWidth
        className="h-12 p-1"
      />
      <div className="mt-5">
        {items.length === 0 ? (
          <p className="py-10 text-center text-callout text-muted-foreground">{T.empty}</p>
        ) : tab === "lista" ? (
          <DayList items={items} tz={tz} onOpen={onOpenAppointment} />
        ) : (
          <DayTimeline items={items} tz={tz} slotMin={slotMin} slotMax={slotMax} onOpen={onOpenAppointment} />
        )}
      </div>
    </>
  );

  if (!wide) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" aria-describedby={undefined} className="max-h-[90dvh] overflow-y-auto">
          <SheetHeader className="flex-row items-center justify-between gap-3 pr-10">
            <SheetTitle>{title}</SheetTitle>
            {plus}
          </SheetHeader>
          <div className="mt-4">{body}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <MorphDialog open={open} onOpenChange={onOpenChange} origin={origin}>
      <MorphDialogContent
        anchor="end"
        closeSide="left"
        className="w-[min(100%,34rem)] bg-[#f9f8fa]"
        aria-describedby={undefined}
      >
        <MorphDialogHeader className="min-h-11 flex-row items-center justify-between gap-3 pl-14 pr-0">
          <MorphDialogTitle className="min-w-0 truncate text-title-2 font-normal text-muted-foreground">
            {title}
          </MorphDialogTitle>
          {plus}
        </MorphDialogHeader>
        <div className="mt-5">{body}</div>
      </MorphDialogContent>
    </MorphDialog>
  );
}

function statusClass(status: string) {
  return `appt-event appt-event--${status.toLowerCase()}`;
}

function Chip({ icon: Icon, label, filled }: { icon: LucideIcon; label: string; filled: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full py-0.5 text-footnote",
        filled ? "bg-white px-2.5 text-[#0a0a0a]" : "opacity-75",
      )}
    >
      <Icon className="size-3.5" strokeWidth={2} aria-hidden />
      {label}
    </span>
  );
}

/** Lista: una tarjeta por turno (estado · paciente · hora, y abajo lo pendiente). */
function DayList({
  items,
  tz,
  onOpen,
}: {
  items: DayAppointment[];
  tz: string;
  onOpen: (id: string, from: HTMLElement) => void;
}) {
  return (
    <ul className="space-y-2.5">
      {items.map((it) => {
        // Sobre la tarjeta negra (Confirmado) los chips van en blanco, como en la referencia.
        const filled = it.status === "CONFIRMED";
        const pendingPayment = !it.hasFullPayment && it.status !== "NO_SHOW";
        return (
          <li key={it.id}>
            <button
              type="button"
              onClick={(e) => onOpen(it.id, e.currentTarget)}
              className={cn(
                statusClass(it.status),
                "flex w-full flex-col gap-2 rounded-2xl px-4 py-3.5 text-left transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              <span className="flex w-full min-w-0 items-center gap-2.5">
                <AppointmentStatusDot status={it.status} color={it.serviceColor} />
                <span className="min-w-0 flex-1 truncate text-body font-medium">{it.patientLabel}</span>
                <span className="shrink-0 text-callout font-medium tabular-nums">{formatTime(new Date(it.start), tz)}</span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5 pl-[1.625rem]">
                <span className="text-footnote opacity-75">{it.serviceName}</span>
                {pendingPayment ? <Chip icon={BanknoteX} label={T.pendingPayment} filled={filled} /> : null}
                {it.hasNote ? <Chip icon={FileText} label={T.hasNote} filled={filled} /> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Agenda: el día por hora, cada turno del alto de su duración. */
function DayTimeline({
  items,
  tz,
  slotMin,
  slotMax,
  onOpen,
}: {
  items: DayAppointment[];
  tz: string;
  slotMin: string;
  slotMax: string;
  onOpen: (id: string, from: HTMLElement) => void;
}) {
  const spans = items.map((it) => ({
    it,
    startMin: minutesOfDay(it.start),
    // Un turno que termina pasada la medianoche llega hasta el final del día.
    endMin: it.end.slice(0, 10) === it.start.slice(0, 10) ? minutesOfDay(it.end) : 24 * 60,
  }));
  const range = dayTimelineRange(slotMin, slotMax, spans);
  const hours = Array.from({ length: (range.toMin - range.fromMin) / 60 }, (_, i) => range.fromMin / 60 + i);

  return (
    <div className="relative" style={{ height: hours.length * HOUR_PX }}>
      {hours.map((h, i) => (
        <div
          key={h}
          aria-hidden
          className="absolute inset-x-0 flex items-start gap-3 border-t border-black/[0.06]"
          style={{ top: i * HOUR_PX }}
        >
          <span className="-mt-2.5 w-11 bg-[#f9f8fa] pr-1 text-footnote tabular-nums text-muted-foreground">
            {String(h).padStart(2, "0")}:00
          </span>
        </div>
      ))}
      {spans.map(({ it, startMin, endMin }) => {
        const pos = dayTimelineBlock({ startMin, endMin }, range);
        return (
          <button
            key={it.id}
            type="button"
            onClick={(e) => onOpen(it.id, e.currentTarget)}
            className={cn(
              statusClass(it.status),
              "absolute left-14 right-0 flex min-h-8 items-start gap-2 overflow-hidden rounded-xl px-3 py-1.5 text-left text-footnote font-medium transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
            style={{ top: `${pos.top}%`, height: `${pos.height}%` }}
          >
            <AppointmentStatusDot status={it.status} color={it.serviceColor} />
            <span className="min-w-0 flex-1 truncate">{it.patientLabel}</span>
            <span className="shrink-0 tabular-nums">{formatTime(new Date(it.start), tz)}</span>
          </button>
        );
      })}
    </div>
  );
}
