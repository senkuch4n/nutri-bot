"use client";

import { useId, useState } from "react";
import { AnimatePresence, m, useReducedMotionConfig } from "motion/react";
import { Ban, CalendarOff, ChevronRight, Clock, Trash2 } from "lucide-react";
import { AVAILABILITY_TEXT, exceptionDayLabel, exceptionDetail, exceptionKindOf, splitExceptions } from "@nutri-bot/core";
import { MoreActionsMenu } from "@/components/more-actions-menu";
import { cn } from "@/components/ui";
import { fades, springs } from "@/lib/motion";
import type { ExceptionData } from "./view";

const T = AVAILABILITY_TEXT;

/**
 * "Días especiales" (HU-017b-2): panel tintado con solo las próximas (hoy incluido), la más cercana
 * primero: la fecha arriba y qué pasa debajo ("No atendés · Feriado"); las pasadas quedan en
 * "Pasadas (N)", cerrado. Cada una tiene "…" con "Borrar".
 */
export function ExceptionsSection({
  exceptions,
  todayKey,
  onDelete,
}: {
  exceptions: readonly ExceptionData[];
  todayKey: string;
  onDelete: (e: ExceptionData) => Promise<unknown>;
}) {
  const { upcoming, past } = splitExceptions(exceptions, todayKey);
  return (
    <section aria-labelledby="dias-especiales" className="rounded-[1.75rem] bg-[#f6f5f8] p-5 sm:p-7">
      {/* Sin "+" propio: se agrega desde «Agregar día especial» del encabezado de la pantalla. */}
      <h2 id="dias-especiales" className="text-headline text-foreground">
        {T.exceptionsTitle}
      </h2>

      {upcoming.length === 0 ? (
        <div className="mt-4 flex flex-col items-center rounded-2xl bg-background/70 px-5 py-8 text-center">
          <span className="mb-3 inline-flex size-11 items-center justify-center rounded-full bg-background text-muted-foreground">
            <CalendarOff className="size-5" strokeWidth={1.75} aria-hidden />
          </span>
          <p className="text-body font-medium text-foreground">Sin días especiales</p>
          <p className="mt-1 max-w-64 text-subheadline text-muted-foreground">
            Feriados, días libres u horarios distintos a los de todas las semanas.
          </p>
        </div>
      ) : (
        <ExceptionList exceptions={upcoming} todayKey={todayKey} onDelete={onDelete} className="mt-4" />
      )}
      {past.length > 0 ? <PastExceptions past={past} todayKey={todayKey} onDelete={onDelete} /> : null}
    </section>
  );
}

function ExceptionList({
  exceptions,
  todayKey,
  onDelete,
  className,
}: {
  exceptions: readonly ExceptionData[];
  todayKey: string;
  onDelete: (e: ExceptionData) => Promise<unknown>;
  className?: string;
}) {
  return (
    <ul className={cn("space-y-2", className)}>
      {exceptions.map((e) => (
        <ExceptionRow key={e.id} exception={e} todayKey={todayKey} onDelete={onDelete} />
      ))}
    </ul>
  );
}

function ExceptionRow({
  exception,
  todayKey,
  onDelete,
}: {
  exception: ExceptionData;
  todayKey: string;
  onDelete: (e: ExceptionData) => Promise<unknown>;
}) {
  // Ícono por tipo (no solo color): Ban = no atiende; Clock = otro horario.
  const kind = exceptionKindOf(exception);
  const Icon = kind === "custom_hours" ? Clock : Ban;
  const day = exceptionDayLabel(exception.dayKey, todayKey);
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-background py-3 pl-3 pr-1.5">
      <span
        className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f6f5f8]",
          kind === "custom_hours" ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <Icon className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-callout font-medium text-foreground">{day}</p>
        <p className="text-subheadline text-muted-foreground">{exceptionDetail(exception)}</p>
      </div>
      <MoreActionsMenu
        label={`Más opciones del ${day.charAt(0).toLowerCase()}${day.slice(1)}`}
        actions={[
          {
            key: "borrar",
            label: "Borrar",
            icon: <Trash2 />,
            destructive: true,
            onSelect: () => onDelete(exception),
          },
        ]}
      />
    </li>
  );
}

function PastExceptions({
  past,
  todayKey,
  onDelete,
}: {
  past: readonly ExceptionData[];
  todayKey: string;
  onDelete: (e: ExceptionData) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const reduced = Boolean(useReducedMotionConfig());
  const contentId = useId();
  return (
    <div className="mt-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((o) => !o)}
        className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-callout font-medium text-muted-foreground press-none pressed:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <m.span
          aria-hidden
          className="inline-flex"
          initial={false}
          animate={{ rotate: open ? 90 : 0 }}
          transition={reduced ? { duration: 0 } : springs.quick}
        >
          <ChevronRight className="size-4" strokeWidth={2} />
        </m.span>
        {T.past(past.length)}
      </button>
      <div id={contentId}>
        <AnimatePresence initial={false}>
          {open ? (
            <m.div key="past" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fades.fast}>
              <ExceptionList exceptions={past} todayKey={todayKey} onDelete={onDelete} className="mt-1 opacity-80" />
            </m.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
