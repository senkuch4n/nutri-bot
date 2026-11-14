"use client";

import { useId, useState } from "react";
import { ListFilter } from "lucide-react";
import { PATIENT_DIRECTORY_TEXT, type PatientStage } from "@nutri-bot/core";
import { Label } from "@/components/primitives/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover";
import { RadioGroup, RadioGroupItem } from "@/components/primitives/radio-group";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/primitives/sheet";
import { Button } from "@/components/ui";

const T = PATIENT_DIRECTORY_TEXT;

export type PatientStageFilter = "all" | PatientStage;
const STAGE_OPTIONS: PatientStageFilter[] = ["all", "in_progress", "dropped"];

/** «Filtros» de Pacientes: popover (≥ 640 px) o sheet inferior (< 640 px), igual que en Turnos. Cada
 *  cambio se aplica al instante. */
export function PatientFilters({
  stage,
  wide,
  onChange,
}: {
  stage: PatientStageFilter;
  wide: boolean;
  onChange: (stage: PatientStageFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const active = stage === "all" ? 0 : 1;

  const trigger = (
    <Button
      variant="ghost"
      className="font-normal"
      aria-label={T.filtersLabel(active)}
      onClick={wide ? undefined : () => setOpen(true)}
    >
      <ListFilter aria-hidden />
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

  const body = (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2.5 text-caption uppercase text-muted-foreground">{T.stageLegend}</legend>
        <RadioGroup
          name="estado"
          value={stage}
          onValueChange={(v) => onChange(v as PatientStageFilter)}
          className="gap-y-3"
        >
          {STAGE_OPTIONS.map((option) => (
            <div key={option} className="flex items-center gap-2.5">
              <RadioGroupItem id={`${id}-${option}`} value={option} />
              <Label htmlFor={`${id}-${option}`} className="font-normal">
                {T.stageFilter[option]}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>
      <div className="flex justify-end border-t pt-3">
        <Button variant="plain" size="sm" className="-mr-3" disabled={active === 0} onClick={() => onChange("all")}>
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
