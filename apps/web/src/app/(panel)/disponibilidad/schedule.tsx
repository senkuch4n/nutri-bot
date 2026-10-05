"use client";

import { ChevronRight, Plus } from "lucide-react";
import {
  AVAILABILITY_TEXT,
  WEEKDAY_NAMES,
  WEEKDAY_ORDER,
  dayScheduleText,
  overlappingRangeIds,
  timeRangePhrase,
} from "@nutri-bot/core";
import { GroupedList } from "@/components/grouped-list";
import { Badge, Button, cn } from "@/components/ui";

const T = AVAILABILITY_TEXT;

export interface Rule {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

/** Id del botón "Agregar horario" de un día: a dónde vuelve el foco si el horario que se editaba se borra. */
export function addRangeButtonId(weekday: number): string {
  return `agregar-horario-${weekday}`;
}

/**
 * "Horario de todas las semanas" (HU-017b-2): los siete días, de lunes a domingo, en todos los anchos.
 * Cada horario es un botón de 44 px que abre el panel de edición; "Agregar horario" en cada día. Si dos
 * horarios del mismo día se pisan (cargas viejas), el día lo marca con "Se superponen" y esos botones
 * quedan resaltados para editarlos.
 */
export function WeeklySchedule({
  rules,
  onAdd,
  onEdit,
}: {
  rules: readonly Rule[];
  onAdd: (weekday: number) => void;
  onEdit: (rule: Rule) => void;
}) {
  return (
    <GroupedList header={T.weeklyTitle}>
      {WEEKDAY_ORDER.map((weekday) => {
        const day = WEEKDAY_NAMES[weekday]!;
        const ranges = rules
          .filter((r) => r.weekday === weekday)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));
        const overlapping = overlappingRangeIds(ranges);
        return (
          <li
            key={weekday}
            className={cn(
              "relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3",
              "sm:grid-cols-[7.5rem_minmax(0,1fr)_auto]",
              "after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-border last:after:hidden",
            )}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-headline text-foreground">{day}</span>
              {overlapping.size > 0 ? <Badge tone="warning">{T.overlapsBadge}</Badge> : null}
              {/* El día completo en palabras, para lectores de pantalla ("Lunes: de 9:00 a 13:00 y …"). */}
              <span className="sr-only">{`: ${dayScheduleText(ranges)}`}</span>
            </div>

            <div className="col-span-2 flex flex-wrap items-center gap-2 sm:order-none sm:col-span-1 max-sm:order-last">
              {ranges.length === 0 ? (
                <p className="text-callout text-muted-foreground" aria-hidden>
                  {dayScheduleText([])}
                </p>
              ) : (
                ranges.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onEdit(r)}
                    aria-label={`Editar el horario del ${day.toLowerCase()} ${timeRangePhrase(r)}`}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1 rounded-full bg-secondary pl-4 pr-3 text-callout tabular-nums text-foreground",
                      "press-none transition-colors duration-hover hover:bg-fill-hover pressed:bg-fill-pressed",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      overlapping.has(r.id) && "bg-warning-muted text-warning hover:bg-warning-muted",
                    )}
                  >
                    <span aria-hidden>{timeRangePhrase(r)}</span>
                    <ChevronRight className="size-4 text-tertiary" strokeWidth={2} aria-hidden />
                  </button>
                ))
              )}
            </div>

            <Button
              id={addRangeButtonId(weekday)}
              type="button"
              variant="tinted"
              onClick={() => onAdd(weekday)}
              aria-label={`${T.addRange} el ${day.toLowerCase()}`}
              className="justify-self-end"
            >
              <Plus aria-hidden />
              {T.addRange}
            </Button>
          </li>
        );
      })}
    </GroupedList>
  );
}
