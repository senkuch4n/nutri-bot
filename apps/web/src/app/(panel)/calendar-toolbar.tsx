"use client";

import type { Ref } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AGENDA_TEXT, calendarNavLabels, type CalendarView } from "@nutri-bot/core";
import { Button } from "@/components/primitives/button";
import { Skeleton } from "@/components/primitives/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip";
import { SegmentedControl, type SegmentedOption } from "@/components/segmented-control";
import { CALENDAR_VIEWS } from "@/lib/calendar-route";

const VIEW_OPTIONS: ReadonlyArray<SegmentedOption<CalendarView>> = CALENDAR_VIEWS.map((v) => ({
  value: v,
  label: AGENDA_TEXT.views[v],
}));

// Debajo de 640 px: dos renglones (título arriba; ‹ Hoy › y el segmentado a lo ancho abajo, Q14).
// Desde 640 px: un renglón (‹ Hoy › · título · segmentado a la derecha).
const ROW = "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 sm:flex sm:flex-wrap";

/**
 * Barra propia del calendario (HU-017b-1, SDD 4.4): reemplaza la de FullCalendar. Controles de 44 px
 * con nombre accesible; el título es un `h2` enfocable (ahí va el foco cuando el turno elegido se oculta).
 */
export function CalendarToolbar({
  view,
  title,
  titleRef,
  onPrev,
  onNext,
  onToday,
  onViewChange,
}: {
  view: CalendarView;
  title: string;
  titleRef?: Ref<HTMLHeadingElement>;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (view: CalendarView) => void;
}) {
  const labels = calendarNavLabels(view);
  return (
    <div className={`mb-4 ${ROW}`}>
      <div className="flex items-center gap-1">
        <NavButton label={labels.prev} onClick={onPrev}>
          <ChevronLeft aria-hidden />
        </NavButton>
        <Button type="button" variant="secondary" className="h-11 rounded-lg px-4 text-callout" onClick={onToday}>
          {AGENDA_TEXT.today}
        </Button>
        <NavButton label={labels.next} onClick={onNext}>
          <ChevronRight aria-hidden />
        </NavButton>
      </div>
      <h2
        ref={titleRef}
        tabIndex={-1}
        aria-live="polite"
        className="col-span-2 -order-1 min-h-7 min-w-0 rounded-md text-balance text-title-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:order-none sm:flex-1 sm:px-2"
      >
        {title}
      </h2>
      <SegmentedControl
        value={view}
        onValueChange={onViewChange}
        options={VIEW_OPTIONS}
        aria-label={AGENDA_TEXT.viewSelectorLabel}
        size="lg"
        fullWidth
        className="sm:inline-grid sm:w-auto"
      />
    </div>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-lg" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** La barra mientras FullCalendar todavía no se montó (mismo alto; el título queda vacío). */
export function CalendarToolbarSkeleton() {
  return (
    <div className={`mb-4 ${ROW}`} aria-hidden>
      <div className="flex items-center gap-1">
        <Skeleton className="size-11 rounded-lg" />
        <Skeleton className="h-11 w-16 rounded-lg" />
        <Skeleton className="size-11 rounded-lg" />
      </div>
      <div className="col-span-2 -order-1 flex min-h-7 items-center sm:order-none sm:flex-1 sm:px-2">
        <Skeleton className="h-6 w-48 max-w-full" />
      </div>
      <Skeleton className="h-10 w-full rounded-full sm:w-56" />
    </div>
  );
}

/** Esqueleto de la grilla (el mismo de loading.tsx). */
export function CalendarGridSkeleton() {
  return (
    <div aria-hidden>
      <div className="mb-2 grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-4" />
        ))}
      </div>
      <Skeleton className="h-[26rem] w-full" />
    </div>
  );
}
