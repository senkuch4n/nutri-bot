"use client";

import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import { AVAILABILITY_TEXT, WEEKDAY_NAMES, exceptionDayLabel } from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { Button } from "@/components/ui";
import { useDeferredDelete, usePendingDeletions } from "@/lib/deferred-delete";
import { WeeklySchedule, type Rule } from "./schedule";
import { RangeSheet, suggestedRange, type RangeTarget } from "./range-sheet";
import { ExceptionsSection } from "./exceptions";
import { ExceptionSheet } from "./exception-sheet";
import { deleteExceptionAction, deleteRuleAction } from "./actions";

const T = AVAILABILITY_TEXT;

export interface ExceptionData {
  id: string;
  /** "yyyy-MM-dd" */
  dayKey: string;
  type: "BLOCKED" | "CUSTOM_HOURS";
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}

export function ruleDeletionKey(id: string): string {
  return `rule:${id}`;
}

export function exceptionDeletionKey(id: string): string {
  return `exception:${id}`;
}

export function DisponibilidadView({
  rules,
  exceptions,
  todayKey,
}: {
  rules: Rule[];
  exceptions: ExceptionData[];
  todayKey: string;
}) {
  const [rangeTarget, setRangeTarget] = useState<RangeTarget | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  // Desde dónde crece el diálogo del horario (el horario o el "Agregar horario" tocado).
  const [rangeOrigin, setRangeOrigin] = useState<HTMLElement | null>(null);
  const [excOpen, setExcOpen] = useState(false);
  // Desde dónde crece el diálogo del día especial (el botón del encabezado o el "+" del panel).
  const [excOrigin, setExcOrigin] = useState<HTMLElement | null>(null);
  const openException = (origin: HTMLElement) => {
    setExcOrigin(origin);
    setExcOpen(true);
  };
  const confirm = useConfirm();
  const deferredDelete = useDeferredDelete();
  const pending = usePendingDeletions();
  const visibleRules = rules.filter((r) => !pending.has(ruleDeletionKey(r.id)));
  const visibleExceptions = exceptions.filter((e) => !pending.has(exceptionDeletionKey(e.id)));

  const openAdd = (weekday: number, origin: HTMLElement) => {
    const day = visibleRules.filter((r) => r.weekday === weekday);
    setRangeTarget({ mode: "add", weekday, ...suggestedRange(day) });
    setRangeOrigin(origin);
    setRangeOpen(true);
  };
  const openEdit = (rule: Rule, origin: HTMLElement) => {
    setRangeTarget({ mode: "edit", rule });
    setRangeOrigin(origin);
    setRangeOpen(true);
  };

  // Confirmación + borrado diferido con "Deshacer" (8 s). Sin aviso al cerrar la pestaña (T10): es
  // reversible y no le llega a nadie.
  const deleteRule = useCallback(
    async (rule: Rule) => {
      const day = WEEKDAY_NAMES[rule.weekday] ?? "";
      const ok = await confirm({
        title: T.deleteTitle(day, rule),
        description: T.deleteDescription,
        confirmLabel: T.deleteConfirm,
        cancelLabel: "Volver",
      });
      if (!ok) return false;
      deferredDelete({
        key: ruleDeletionKey(rule.id),
        message: T.deleted,
        undoneMessage: T.deletedUndone,
        commit: () => deleteRuleAction(rule.id),
      });
      return true;
    },
    [confirm, deferredDelete],
  );

  const deleteException = useCallback(
    async (e: ExceptionData) => {
      const label = exceptionDayLabel(e.dayKey, todayKey);
      const ok = await confirm({
        title: T.exceptionDeleteTitle(label.charAt(0).toLowerCase() + label.slice(1)),
        description: T.exceptionDeleteDescription,
        confirmLabel: "Borrar",
        cancelLabel: "Volver",
      });
      if (!ok) return false;
      deferredDelete({
        key: exceptionDeletionKey(e.id),
        message: T.exceptionDeleted,
        undoneMessage: T.exceptionUndone,
        commit: () => deleteExceptionAction(e.id),
      });
      return true;
    },
    [confirm, deferredDelete, todayKey],
  );

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-title-1 font-medium">Disponibilidad</h1>
          <p className="mt-1 text-subheadline text-muted-foreground">Tu horario de todas las semanas y los días especiales.</p>
        </div>
        <Button
          className="rounded-full bg-foreground text-background hover:bg-foreground/85 pressed:bg-foreground/75"
          onClick={(e) => openException(e.currentTarget)}
        >
          <Plus aria-hidden />
          {T.addException}
        </Button>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <WeeklySchedule rules={visibleRules} onAdd={openAdd} onEdit={openEdit} />

        <div className="xl:sticky xl:top-6">
          <ExceptionsSection
            exceptions={visibleExceptions}
            todayKey={todayKey}
            onAdd={openException}
            onDelete={deleteException}
          />
        </div>
      </div>

      <RangeSheet
        target={rangeTarget}
        origin={rangeOrigin}
        open={rangeOpen}
        onOpenChange={setRangeOpen}
        onDelete={deleteRule}
      />

      <ExceptionSheet open={excOpen} onOpenChange={setExcOpen} origin={excOrigin} todayKey={todayKey} />
    </div>
  );
}
