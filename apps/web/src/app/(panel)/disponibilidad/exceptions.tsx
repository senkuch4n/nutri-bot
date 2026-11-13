"use client";

import { useId, useState } from "react";
import { AnimatePresence, m, useReducedMotionConfig } from "motion/react";
import { Ban, CalendarOff, ChevronRight, Clock, Plus, Trash2 } from "lucide-react";
import { AVAILABILITY_TEXT, exceptionDayLabel, exceptionKindOf, exceptionLine, splitExceptions } from "@nutri-bot/core";
import { GroupedList, GroupedListRow } from "@/components/grouped-list";
import { MoreActionsMenu } from "@/components/more-actions-menu";
import { Button, EmptyState } from "@/components/ui";
import { fades, springs } from "@/lib/motion";
import type { ExceptionData } from "./view";

const T = AVAILABILITY_TEXT;

/**
 * "Días especiales" (HU-017b-2): solo las próximas (hoy incluido), la más cercana primero, en palabras
 * ("Lunes 12 de octubre · No atendés · Feriado"); las pasadas quedan en "Pasadas (N)", cerrado. Cada
 * una tiene "…" con "Borrar".
 */
export function ExceptionsSection({
  exceptions,
  todayKey,
  onAdd,
  onDelete,
}: {
  exceptions: readonly ExceptionData[];
  todayKey: string;
  onAdd: () => void;
  onDelete: (e: ExceptionData) => Promise<unknown>;
}) {
  const { upcoming, past } = splitExceptions(exceptions, todayKey);
  return (
    <div className="space-y-4">
      {upcoming.length === 0 ? (
        <section>
          <h3 className="px-4 pb-1.5 text-subheadline font-medium text-muted-foreground">{T.exceptionsTitle}</h3>
          <div className="rounded-xl bg-card shadow-card more-contrast:border more-contrast:border-input">
            <EmptyState
              icon={CalendarOff}
              title="Sin días especiales"
              description="Feriados, días libres u horarios distintos a los de todas las semanas."
              action={
                <Button variant="tinted" onClick={onAdd}>
                  <Plus aria-hidden />
                  {T.addException}
                </Button>
              }
            />
          </div>
        </section>
      ) : (
        <GroupedList header={T.exceptionsTitle}>
          {upcoming.map((e) => (
            <ExceptionRow key={e.id} exception={e} todayKey={todayKey} onDelete={onDelete} />
          ))}
        </GroupedList>
      )}
      {past.length > 0 ? <PastExceptions past={past} todayKey={todayKey} onDelete={onDelete} /> : null}
    </div>
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
  const day = exceptionDayLabel(exception.dayKey, todayKey);
  return (
    <GroupedListRow
      icon={kind === "custom_hours" ? Clock : Ban}
      label={exceptionLine(exception, todayKey)}
      accessory={
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
      }
    />
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
    <section>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((o) => !o)}
        className="ml-3 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-callout font-medium text-muted-foreground press-none pressed:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
              <GroupedList className="mt-1">
                {past.map((e) => (
                  <ExceptionRow key={e.id} exception={e} todayKey={todayKey} onDelete={onDelete} />
                ))}
              </GroupedList>
            </m.div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
