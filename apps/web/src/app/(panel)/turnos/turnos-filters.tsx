"use client";

import { useId, useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
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
import { Button, Select } from "@/components/ui";

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

/** HU-021 (SDD 7.5). Botón "Filtros" con popover (≥ 640 px) o sheet inferior (< 640 px). Cada cambio se
 *  aplica al instante (sin "Aplicar"); quien llama lo escribe en la URL. */
export function TurnosFilters({
  filters,
  services,
  wide,
  onChange,
}: {
  filters: AppointmentListFilters;
  /** Todos los servicios; el grupo "Servicio" solo se muestra si hay más de uno. */
  services: { id: string; name: string }[];
  wide: boolean;
  onChange: (next: AppointmentListFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const serviceSelectId = useId();
  const count = activeAppointmentFilterCount(filters);

  const trigger = (
    <Button variant="secondary" aria-label={T.filtersLabel(count)} onClick={wide ? undefined : () => setOpen(true)}>
      <SlidersHorizontal aria-hidden />
      {T.filters}
      {count > 0 ? (
        <span
          aria-hidden
          className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-footnote font-semibold tabular-nums text-primary-foreground"
        >
          {count}
        </span>
      ) : null}
    </Button>
  );

  const body = (
    <div className="space-y-5">
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
      <div className="flex justify-end border-t pt-3">
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
