"use client";

import type { ReactNode, Ref } from "react";
import { ArrowLeft, ArrowRight, Columns4, Grid3x3, PanelTop, type LucideIcon } from "lucide-react";
import { AGENDA_TEXT, calendarNavLabels, type CalendarView } from "@nutri-bot/core";
import { Button } from "@/components/primitives/button";
import { Skeleton } from "@/components/primitives/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip";
import { SegmentedControl, type SegmentedOption } from "@/components/segmented-control";

// Orden de la referencia visual (2026-10-31): día, semana y después mes.
const VIEW_ICON: Record<CalendarView, LucideIcon> = { dia: PanelTop, semana: Columns4, mes: Grid3x3 };
const VIEW_OPTIONS: ReadonlyArray<SegmentedOption<CalendarView>> = (["dia", "semana", "mes"] as const).map((v) => ({
  value: v,
  label: null,
  icon: VIEW_ICON[v],
  "aria-label": AGENDA_TEXT.views[v],
}));

// Debajo de 640 px: título arriba y los controles abajo, a lo ancho. Desde 640 px: un renglón
// (título a la izquierda; Filtros, vistas, Hoy y ← → a la derecha).
const ROW = "flex flex-wrap items-center justify-between gap-x-3 gap-y-3";
const ROUND = "size-11 rounded-full bg-secondary hover:bg-secondary/80";

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
  filters,
}: {
  view: CalendarView;
  title: string;
  titleRef?: Ref<HTMLHeadingElement>;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (view: CalendarView) => void;
  /** Botón «Filtros» (calendar-filters.tsx), antes de las vistas. */
  filters?: ReactNode;
}) {
  const labels = calendarNavLabels(view);
  return (
    <div className={`mb-4 ${ROW}`}>
      <h2
        ref={titleRef}
        tabIndex={-1}
        aria-live="polite"
        className="min-h-9 min-w-0 rounded-md text-balance text-[1.75rem] font-semibold leading-9 tracking-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {title}
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        {filters}
        <SegmentedControl
          value={view}
          onValueChange={onViewChange}
          options={VIEW_OPTIONS}
          aria-label={AGENDA_TEXT.viewSelectorLabel}
          size="lg"
          className="h-11 p-1 [&>button]:px-3.5"
        />
        <Button
          type="button"
          variant="secondary"
          className="h-11 rounded-full px-4 text-callout"
          onClick={onToday}
        >
          {AGENDA_TEXT.today}
        </Button>
        <NavButton label={labels.prev} onClick={onPrev}>
          <ArrowLeft aria-hidden />
        </NavButton>
        <NavButton label={labels.next} onClick={onNext}>
          <ArrowRight aria-hidden />
        </NavButton>
      </div>
    </div>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-lg" className={ROUND} aria-label={label} onClick={onClick}>
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
      <div className="flex min-h-9 items-center">
        <Skeleton className="h-7 w-52 max-w-full" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-11 w-28 rounded-full" />
        <Skeleton className="h-11 w-36 rounded-full" />
        <Skeleton className="h-11 w-16 rounded-full" />
        <Skeleton className="size-11 rounded-full" />
        <Skeleton className="size-11 rounded-full" />
      </div>
    </div>
  );
}

/** Esqueleto de la grilla (el mismo de loading.tsx): 7 columnas de tarjetas, como el mes. */
export function CalendarGridSkeleton() {
  return (
    <div aria-hidden>
      <div className="mb-2 grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="mx-auto h-4 w-8" />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
