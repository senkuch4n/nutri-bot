"use client";

import { Plus } from "lucide-react";
import {
  AVAILABILITY_TEXT,
  WEEKDAY_NAMES,
  WEEKDAY_ORDER,
  dayScheduleText,
  overlappingRangeIds,
  timeRangePhrase,
} from "@nutri-bot/core";
import { Badge, cn, filledSurfaceClass } from "@/components/ui";

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

/** Panel con borde finito (mismo lenguaje que la ficha y el plan). */
export const AVAILABILITY_PANEL = "rounded-[1.75rem] border border-black/[0.05] bg-[#fcfbfd] p-5 sm:p-7";

const addButtonClass =
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-callout text-muted-foreground press-none touch-target transition-colors duration-hover hover:bg-overlay-hover hover:text-foreground pressed:bg-overlay-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * "Horario de todas las semanas" (HU-017b-2): los siete días, de lunes a domingo, en todos los anchos.
 * Cada horario es una pastilla rellena de 44 px que abre el diálogo de edición (crece desde ella);
 * "Agregar horario" en cada día. Si dos horarios del mismo día se pisan (cargas viejas), el día lo marca
 * con "Se superponen" y esas pastillas quedan resaltadas para editarlas.
 */
export function WeeklySchedule({
  rules,
  onAdd,
  onEdit,
}: {
  rules: readonly Rule[];
  /** `origin`: el botón tocado, desde donde crece el diálogo. */
  onAdd: (weekday: number, origin: HTMLElement) => void;
  onEdit: (rule: Rule, origin: HTMLElement) => void;
}) {
  return (
    <section aria-labelledby="horario-semanal" className={AVAILABILITY_PANEL}>
      <h2 id="horario-semanal" className="text-headline text-foreground">
        {T.weeklyTitle}
      </h2>
      <p className="mt-1 text-subheadline text-muted-foreground">El bot ofrece turnos solo en este horario.</p>

      <ul className="mt-4 divide-y divide-black/[0.05]">
        {WEEKDAY_ORDER.map((weekday) => {
          const day = WEEKDAY_NAMES[weekday]!;
          const ranges = rules
            .filter((r) => r.weekday === weekday)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
          const overlapping = overlappingRangeIds(ranges);
          const empty = ranges.length === 0;
          return (
            <li
              key={weekday}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3",
                "sm:grid-cols-[8rem_minmax(0,1fr)_auto]",
              )}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className={cn("text-body", empty ? "text-muted-foreground" : "font-medium text-foreground")}>{day}</span>
                {overlapping.size > 0 ? <Badge tone="warning">{T.overlapsBadge}</Badge> : null}
                {/* El día completo en palabras, para lectores de pantalla ("Lunes: de 9:00 a 13:00 y …"). */}
                <span className="sr-only">{`: ${dayScheduleText(ranges)}`}</span>
              </div>

              <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1 max-sm:order-last">
                {empty ? (
                  <p className="text-callout text-tertiary" aria-hidden>
                    {dayScheduleText([])}
                  </p>
                ) : (
                  ranges.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={(e) => onEdit(r, e.currentTarget)}
                      aria-label={`Editar el horario del ${day.toLowerCase()} ${timeRangePhrase(r)}`}
                      className={cn(
                        filledSurfaceClass,
                        "inline-flex min-h-11 items-center rounded-full px-4 text-callout tabular-nums text-foreground",
                        "press-none transition-colors duration-hover hover:bg-[#e2e0e4] pressed:bg-[#d9d7dc]",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        overlapping.has(r.id) && "bg-warning-muted text-warning hover:bg-warning-muted",
                      )}
                    >
                      <span aria-hidden>{timeRangePhrase(r)}</span>
                    </button>
                  ))
                )}
              </div>

              <button
                id={addRangeButtonId(weekday)}
                type="button"
                onClick={(e) => onAdd(weekday, e.currentTarget)}
                aria-label={`${T.addRange} el ${day.toLowerCase()}`}
                title={T.addRange}
                className={cn(addButtonClass, "justify-self-end")}
              >
                <Plus className="size-4" strokeWidth={2} aria-hidden />
                <span className="max-sm:sr-only">{T.addRange}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
