"use client";

import { useId, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  AGENDA_TEXT,
  APPOINTMENT_LIST_TEXT,
  APPOINTMENT_STATUS_TEXT,
  calendarFilterCount,
  toggleCalendarFilter,
  type CalendarFilters as Filters,
} from "@nutri-bot/core";
import { Checkbox } from "@/components/primitives/checkbox";
import { Label } from "@/components/primitives/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/primitives/sheet";
import { Button } from "@/components/ui";
import { AppointmentStatusDot, CALENDAR_STATUSES } from "./appointment-status-dot";

const T = APPOINTMENT_LIST_TEXT;
// Punto neutro para la columna de estados: el color ahí no es de ningún servicio.
const NEUTRAL_DOT = "#8e8a93";

/**
 * «Filtros» del calendario (reemplaza la leyenda): cada servicio con su color y cada estado con su marca,
 * tildados = se ven. Popover en escritorio, hoja inferior en el celular, como en Pacientes y Turnos.
 */
export function CalendarFilters({
  services,
  filters,
  wide,
  onChange,
}: {
  services: { name: string; color: string }[];
  filters: Filters;
  wide: boolean;
  onChange: (filters: Filters) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const active = calendarFilterCount(filters);

  const trigger = (
    <Button
      variant="ghost"
      className="h-11 rounded-full border border-border/70 bg-background px-4 text-callout font-medium"
      aria-label={T.filtersLabel(active)}
      onClick={wide ? undefined : () => setOpen(true)}
    >
      <SlidersHorizontal aria-hidden />
      {T.filters}
      {active > 0 ? (
        <span
          aria-hidden
          className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-footnote font-semibold tabular-nums text-background"
        >
          {active}
        </span>
      ) : null}
    </Button>
  );

  const option = (key: string, label: string, dot: React.ReactNode, checked: boolean, toggle: () => void) => (
    <div key={key} className="flex items-center gap-2.5">
      <Checkbox id={`${id}-${key}`} checked={checked} onCheckedChange={toggle} />
      <Label htmlFor={`${id}-${key}`} className="flex min-w-0 items-center gap-2 font-normal">
        {dot}
        <span className="truncate">{label}</span>
      </Label>
    </div>
  );

  const body = (
    <div className="space-y-5">
      {services.length > 0 ? (
        <fieldset className="space-y-3">
          <legend className="mb-2.5 text-caption uppercase text-muted-foreground">{AGENDA_TEXT.legendServices}</legend>
          {services.map((s) =>
            option(
              `s-${s.name}`,
              s.name,
              <AppointmentStatusDot status="CONFIRMED" color={s.color} />,
              !filters.hiddenServices.includes(s.name),
              () => onChange({ ...filters, hiddenServices: toggleCalendarFilter(filters.hiddenServices, s.name) }),
            ),
          )}
        </fieldset>
      ) : null}
      <fieldset className="space-y-3">
        <legend className="mb-2.5 text-caption uppercase text-muted-foreground">{AGENDA_TEXT.legendStates}</legend>
        {CALENDAR_STATUSES.map((status) =>
          option(
            `e-${status}`,
            APPOINTMENT_STATUS_TEXT[status],
            <AppointmentStatusDot status={status} color={NEUTRAL_DOT} />,
            !filters.hiddenStatuses.includes(status),
            () => onChange({ ...filters, hiddenStatuses: toggleCalendarFilter(filters.hiddenStatuses, status) }),
          ),
        )}
      </fieldset>
      <div className="flex justify-end border-t pt-3">
        <Button
          variant="plain"
          size="sm"
          className="-mr-3"
          disabled={active === 0}
          onClick={() => onChange({ hiddenServices: [], hiddenStatuses: [] })}
        >
          {T.clearFilters}
        </Button>
      </div>
    </div>
  );

  if (wide) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="w-64">
          {body}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <>
      {trigger}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle>{T.filters}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">{body}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
