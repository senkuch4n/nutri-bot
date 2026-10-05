"use client";

import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import { AVAILABILITY_TEXT, WEEKDAY_NAMES, exceptionDayLabel } from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { Button, PageHeader } from "@/components/ui";
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
  const [excOpen, setExcOpen] = useState(false);
  const confirm = useConfirm();
  const deferredDelete = useDeferredDelete();
  const pending = usePendingDeletions();
  const visibleRules = rules.filter((r) => !pending.has(ruleDeletionKey(r.id)));
  const visibleExceptions = exceptions.filter((e) => !pending.has(exceptionDeletionKey(e.id)));

  const openAdd = (weekday: number) => {
    const day = visibleRules.filter((r) => r.weekday === weekday);
    setRangeTarget({ mode: "add", weekday, ...suggestedRange(day) });
    setRangeOpen(true);
  };
  const openEdit = (rule: Rule) => {
    setRangeTarget({ mode: "edit", rule });
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
      <PageHeader
        title="Disponibilidad"
        description="Tu horario de todas las semanas y los días especiales."
        action={
          <Button size="lg" onClick={() => setExcOpen(true)}>
            <Plus aria-hidden />
            {T.addException}
          </Button>
        }
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <WeeklySchedule rules={visibleRules} onAdd={openAdd} onEdit={openEdit} />

        <div className="xl:sticky xl:top-8">
          <ExceptionsSection
            exceptions={visibleExceptions}
            todayKey={todayKey}
            onAdd={() => setExcOpen(true)}
            onDelete={deleteException}
          />
        </div>
      </div>

      <RangeSheet target={rangeTarget} open={rangeOpen} onOpenChange={setRangeOpen} onDelete={deleteRule} />

      <ExceptionSheet open={excOpen} onOpenChange={setExcOpen} todayKey={todayKey} />
    </div>
  );
}
