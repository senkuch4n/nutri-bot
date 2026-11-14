"use client";

import { useId, useState, type ReactNode } from "react";
import { ListFilter, Search } from "lucide-react";
import {
  APPOINTMENT_LIST_TEXT,
  DEFAULT_APPOINTMENT_LIST_FILTERS,
  activeAppointmentFilterCount,
  type AppointmentListFilters,
  type AppointmentPaymentFilter,
  type AppointmentStatusFilter,
} from "@nutri-bot/core";
import { Label } from "@/components/primitives/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover";
import { RadioGroup, RadioGroupItem } from "@/components/primitives/radio-group";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/primitives/sheet";
import { Button, Input, Select } from "@/components/ui";

const T = APPOINTMENT_LIST_TEXT;

const STATUS_OPTIONS: AppointmentStatusFilter[] = [
  "all",
  "upcoming",
  "unclosed",
  "completed",
  "no_show",
  "cancelled",
  "awaiting_deposit",
];
const PAYMENT_OPTIONS: AppointmentPaymentFilter[] = ["all", "paid", "partial", "none"];

function FilterGroup({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="mb-2.5 text-caption uppercase text-muted-foreground">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

function RadioOptions<V extends string>({
  name,
  value,
  options,
  labels,
  onChange,
}: {
  name: string;
  value: V;
  options: readonly V[];
  labels: Record<V, string>;
  onChange: (v: V) => void;
}) {
  const id = useId();
  return (
    <RadioGroup
      name={name}
      value={value}
      onValueChange={(v) => onChange(v as V)}
      className="grid-cols-2 gap-x-4 gap-y-3"
    >
      {options.map((option) => (
        <div key={option} className="flex items-center gap-2.5">
          <RadioGroupItem id={`${id}-${option}`} value={option} />
          <Label htmlFor={`${id}-${option}`} className="font-normal">
            {labels[option]}
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}

/** HU-021 (SDD 7.5 + V1). Botón "Filtros" con popover (≥ 640 px) o sheet inferior (< 640 px). Adentro van
 *  el buscador por paciente y los filtros de estado, pago y servicio. Cada cambio se aplica al instante (sin
 *  "Aplicar"); quien llama lo escribe en la URL. */
export function TurnosFilters({
  filters,
  services,
  wide,
  resultCount,
  onChange,
  onQueryChange,
}: {
  filters: AppointmentListFilters;
  /** Todos los servicios; el grupo "Servicio" solo se muestra si hay más de uno. */
  services: { id: string; name: string }[];
  wide: boolean;
  /** Turnos visibles con los filtros actuales (pie del panel). */
  resultCount: number;
  onChange: (next: AppointmentListFilters) => void;
  /** El buscador tiene estado propio en quien llama (para no mover el cursor). */
  onQueryChange: (query: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const serviceSelectId = useId();
  const searchId = useId();
  const count = activeAppointmentFilterCount(filters);
  // El buscador vive dentro del panel: el indicador del botón también lo cuenta.
  const shown = count + (filters.query.trim() ? 1 : 0);

  const trigger = (
    <Button
      variant="ghost"
      className="font-normal"
      aria-label={T.filtersLabel(shown)}
      onClick={wide ? undefined : () => setOpen(true)}
    >
      <ListFilter aria-hidden />
      {T.filters}
      {shown > 0 ? (
        <span
          aria-hidden
          className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-footnote font-semibold tabular-nums text-background"
        >
          {shown}
        </span>
      ) : null}
    </Button>
  );

  const body = (
    <div className="space-y-5">
      <div className="space-y-2">
        <label htmlFor={searchId} className="block text-caption uppercase text-muted-foreground">
          {T.columns.patient}
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id={searchId}
            type="search"
            aria-label={T.searchLabel}
            value={filters.query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={T.searchPlaceholder}
            spellCheck={false}
            className="h-11 pl-9"
            autoComplete="off"
          />
        </div>
      </div>
      <FilterGroup legend={T.filterGroups.status}>
        <RadioOptions
          name="estado"
          value={filters.status}
          options={STATUS_OPTIONS}
          labels={T.statusFilter}
          onChange={(status) => onChange({ ...filters, status })}
        />
      </FilterGroup>
      <FilterGroup legend={T.filterGroups.payment}>
        <RadioOptions
          name="pago"
          value={filters.payment}
          options={PAYMENT_OPTIONS}
          labels={T.paymentFilter}
          onChange={(payment) => onChange({ ...filters, payment })}
        />
      </FilterGroup>
      {services.length > 1 ? (
        <div className="space-y-2">
          <label
            htmlFor={serviceSelectId}
            className="block text-caption uppercase text-muted-foreground"
          >
            {T.filterGroups.service}
          </label>
          <Select
            id={serviceSelectId}
            value={filters.serviceId ?? ""}
            onChange={(e) => onChange({ ...filters, serviceId: e.target.value || null })}
          >
            <option value="">{T.filterGroups.allServices}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 border-t pt-3">
        <p className="text-subheadline tabular-nums text-muted-foreground">{T.count(resultCount)}</p>
        <Button
          variant="plain"
          size="sm"
          className="-mr-3"
          disabled={count === 0}
          onClick={() => onChange({ ...DEFAULT_APPOINTMENT_LIST_FILTERS, query: filters.query })}
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
        <PopoverContent align="end" sideOffset={8} className="w-80">
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
